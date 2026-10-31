// Ported from fli (MIT, commit 881aee5ff): search/_tfs.py fetch policy and
// search/client.py headers/SOCS cookie.
import 'server-only';
import { fixturesEnabled, readFixture, recordFixture } from '../fixtures';
import { ProviderError } from '../types';
import { extractPayload } from './decode';

export const PROVIDER = 'google_flights';
export const PAGE_URL = 'https://www.google.com/travel/flights';

const ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];

const SOCS_COOKIE =
  'CAISNQgQEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMzE3LjA5X3AwGgJlbiADGgYIgLC_rwY';

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8',
  Cookie: `SOCS=${SOCS_COOKIE}`,
};

const CONSENT_MARKERS = [
  'consent.google.',
  'Before you continue',
  'sorry/index',
  '/sorry/',
];

// Shared page-load limiter: <= GOOGLE_FLIGHTS_CONCURRENCY parallel fetches
// with 250–750 ms jitter between page loads.
const globalLimiter = { active: 0, queue: [] as (() => void)[] };

export function setConcurrency(n: number) {
  limiterMax = Math.max(1, n);
}
let limiterMax = 3;

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (globalLimiter.active >= limiterMax) {
    await new Promise<void>((r) => globalLimiter.queue.push(r));
  }
  globalLimiter.active++;
  try {
    return await fn();
  } finally {
    globalLimiter.active--;
    globalLimiter.queue.shift()?.();
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 500));
  }
}

export function pageUrl(tfs: string, opts: { currency: string; hl: string; gl: string }): string {
  return `${PAGE_URL}?tfs=${tfs}&hl=${opts.hl}&gl=${opts.gl}&curr=${opts.currency}`;
}

/**
 * Fetch a search page and return its ds:1 payload. Fixture replay returns the
 * stored extracted-ds:1 JSON directly; recording stores the extracted payload
 * (never the 2 MB HTML).
 */
export async function fetchDs1(
  url: string,
  fixtureRequest: unknown,
  operation: string,
): Promise<unknown> {
  if (fixturesEnabled()) {
    return JSON.parse(readFixture(PROVIDER, operation, fixtureRequest));
  }

  const recordDir = process.env.TP_RECORD_FIXTURES;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let html: string;
    try {
      const res = await limited(() =>
        fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000), redirect: 'follow' }),
      );
      if (res.status === 403 || res.status === 429) {
        throw new ProviderError(PROVIDER, 'blocked', `Google Flights returned ${res.status}`, true);
      }
      if (!res.ok) {
        throw new ProviderError(PROVIDER, 'network', `Google Flights returned ${res.status}`, true);
      }
      html = await res.text();
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      lastErr = err;
      break;
    }
    if (CONSENT_MARKERS.some((m) => html.includes(m))) {
      throw new ProviderError(PROVIDER, 'blocked', 'Google served a consent/interstitial page', true);
    }
    const payload = extractPayload(html);
    if (payload !== null) {
      if (recordDir) {
        const path = recordFixture(
          recordDir,
          PROVIDER,
          operation,
          fixtureRequest,
          JSON.stringify(payload),
        );
        console.log(`recorded ${PROVIDER}/${operation} -> ${path}`);
      }
      return payload;
    }
    if (attempt + 1 < ATTEMPTS) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]));
    }
  }
  if (lastErr) {
    throw new ProviderError(
      PROVIDER,
      'network',
      `Google Flights request failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      true,
    );
  }
  throw new ProviderError(
    PROVIDER,
    'parse',
    'Search page carried no ds:1 payload after 3 attempts',
  );
}

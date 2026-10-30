import 'server-only';
import { fixturesEnabled, readFixture, recordFixture } from './fixtures';
import { ProviderError, type ProviderErrorKind } from './types';

type ProviderFetchOpts = {
  provider: string;
  operation: string;
  timeoutMs?: number;
  /**
   * The normalized request object. Used as the fixture lookup key when
   * PROVIDER_FIXTURES_DIR is set; defaults to { url }.
   */
  fixtureRequest?: unknown;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Fetch wrapper for provider calls. Maps transport failures to ProviderError
 * and, in test fixture mode, replays recorded raw responses without touching
 * the network.
 */
export async function providerFetch(
  url: string,
  init: RequestInit = {},
  opts: ProviderFetchOpts,
): Promise<Response> {
  const { provider, operation, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const fixtureRequest = opts.fixtureRequest ?? { url };

  if (fixturesEnabled()) {
    const body = readFixture(provider, operation, fixtureRequest);
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new ProviderError(
      provider,
      'network',
      `${provider} request failed: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
  }

  // Fixture recording mode (scripts/record-fixtures.ts): persist the real raw
  // body, then hand the caller an equivalent Response.
  const recordDir = process.env.TP_RECORD_FIXTURES;
  if (recordDir && res.ok) {
    const body = await res.text();
    const path = recordFixture(
      recordDir,
      provider,
      operation,
      fixtureRequest,
      body,
    );
    console.log(`recorded ${provider}/${operation} -> ${path}`);
    return new Response(body, {
      status: res.status,
      headers: res.headers,
    });
  }
  return res;
}

/** Throw a ProviderError appropriate for a non-2xx provider response. */
export async function raiseForStatus(
  res: Response,
  provider: string,
): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  const detail = body.slice(0, 300);
  const kind: ProviderErrorKind =
    res.status === 401 || res.status === 403
      ? 'auth'
      : res.status === 429
        ? 'quota_exceeded'
        : res.status >= 400 && res.status < 500
          ? 'bad_request'
          : 'network';
  throw new ProviderError(
    provider,
    kind,
    `${provider} responded ${res.status}: ${detail}`,
    kind === 'network' || kind === 'quota_exceeded',
  );
}

/** JSON body for a 2xx response, mapping syntax failures to kind 'parse'. */
export async function readJson<T>(res: Response, provider: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new ProviderError(
      provider,
      'parse',
      `${provider} returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function googleFlightsHeaders(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

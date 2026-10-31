import 'server-only';
import { env } from '@/lib/env';
import { providerFetch, raiseForStatus, readJson } from '../http';
import { ProviderError } from '../types';

export const SERPAPI_PROVIDER = 'serpapi';
const BASE = 'https://serpapi.com/search.json';

/**
 * Shared SerpApi GET. `params` must not include api_key — the key is appended
 * to the URL only, so fixture keys and recordings never carry it. Body-level
 * errors are mapped: quota ⇒ quota_exceeded, the "no results" sentinel is
 * handed back to the caller via the `empty` flag on the thrown error shape.
 */
export async function serpapiGet<T>(
  operation: string,
  params: Record<string, string | number | boolean>,
): Promise<T> {
  if (!env.SERPAPI_API_KEY) {
    throw new ProviderError(
      SERPAPI_PROVIDER,
      'not_configured',
      'SerpApi is not configured — add SERPAPI_API_KEY to .env.local and restart',
    );
  }
  const qs = new URLSearchParams({ api_key: env.SERPAPI_API_KEY });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await providerFetch(`${BASE}?${qs.toString()}`, {}, {
    provider: SERPAPI_PROVIDER,
    operation,
    timeoutMs: 30_000,
    fixtureRequest: params,
  });
  await raiseForStatus(res, SERPAPI_PROVIDER);
  const body = await readJson<T & { error?: string }>(res, SERPAPI_PROVIDER);
  if (body.error) {
    const msg = body.error;
    if (/run out of searches|exceeded your/i.test(msg)) {
      throw new ProviderError(SERPAPI_PROVIDER, 'quota_exceeded', `SerpApi: ${msg}`);
    }
    throw new ProviderError(SERPAPI_PROVIDER, 'empty', `SerpApi: ${msg}`);
  }
  return body;
}

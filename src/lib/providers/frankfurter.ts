import 'server-only';
import { cachedCall } from './cache';
import { providerFetch, raiseForStatus, readJson } from './http';
import { ProviderError } from './types';

const PROVIDER = 'frankfurter';
const BASE = 'https://api.frankfurter.dev/v1';

/** units of `to` per 1 unit of `from` on `date` ('YYYY-MM-DD' or 'latest'). */
export async function fxRate(from: string, to: string, date = 'latest'): Promise<number> {
  if (from === to) return 1;
  const request = { from, to, date };
  return cachedCall(
    {
      provider: PROVIDER,
      operation: 'rate',
      request,
      ttlSeconds: date === 'latest' ? 6 * 60 * 60 : 10 * 365 * 24 * 60 * 60,
    },
    async () => {
      const res = await providerFetch(`${BASE}/${date}?base=${from}&symbols=${to}`, {}, {
        provider: PROVIDER,
        operation: 'rate',
        timeoutMs: 10_000,
        fixtureRequest: request,
      });
      await raiseForStatus(res, PROVIDER);
      const body = await readJson<{ rates?: Record<string, number> }>(res, PROVIDER);
      const r = body.rates?.[to];
      if (r === undefined) {
        throw new ProviderError(PROVIDER, 'empty', `No FX rate ${from}→${to}`);
      }
      return r;
    },
  );
}

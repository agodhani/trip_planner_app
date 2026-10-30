import 'server-only';
import { env } from '@/lib/env';
import { cachedCall } from '../cache';
import { providerFetch, readJson } from '../http';
import { ProviderError } from '../types';

const PROVIDER = 'serpapi';
const ACCOUNT_TTL_SECONDS = 5 * 60;

export type SerpApiAccountStatus =
  | { status: 'not_configured' }
  | {
      status: 'ok';
      searchesLeft: number | null;
      planSearches: number | null;
      searchesUsed: number | null;
      email?: string;
    }
  | { status: 'error'; kind: string; message: string };

type AccountRaw = {
  account_email?: string;
  plan_searches_left?: number;
  total_searches_left?: number;
  plan_monthly_searches?: number;
  this_month_usage?: number;
  searches_per_month?: number;
  error?: string;
};

/**
 * The SerpApi account endpoint is free and not counted against the monthly
 * quota. Without SERPAPI_API_KEY the integration is not_configured.
 */
export async function getSerpApiAccount(): Promise<SerpApiAccountStatus> {
  if (!env.SERPAPI_API_KEY) {
    return { status: 'not_configured' };
  }
  const request = { endpoint: 'account' };
  try {
    const raw = await cachedCall(
      {
        provider: PROVIDER,
        operation: 'account',
        request,
        ttlSeconds: ACCOUNT_TTL_SECONDS,
        credits: 0,
      },
      async () => {
        const url = `https://serpapi.com/account.json?api_key=${encodeURIComponent(
          env.SERPAPI_API_KEY!,
        )}`;
        const res = await providerFetch(
          url,
          {},
          {
            provider: PROVIDER,
            operation: 'account',
            timeoutMs: 30_000,
            fixtureRequest: request,
          },
        );
        if (res.status === 401) {
          throw new ProviderError(PROVIDER, 'auth', 'SerpApi key rejected (401)');
        }
        if (res.status === 429) {
          throw new ProviderError(
            PROVIDER,
            'quota_exceeded',
            'SerpApi quota exceeded',
            true,
          );
        }
        const body = await readJson<AccountRaw>(res, PROVIDER);
        if (body.error) {
          throw new ProviderError(PROVIDER, 'auth', `SerpApi: ${body.error}`);
        }
        return body;
      },
    );
    const left = raw.total_searches_left ?? raw.plan_searches_left ?? null;
    const plan = raw.plan_monthly_searches ?? raw.searches_per_month ?? null;
    return {
      status: 'ok',
      searchesLeft: left,
      planSearches: plan,
      searchesUsed: raw.this_month_usage ?? null,
      email: raw.account_email,
    };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { status: 'error', kind: err.kind, message: err.message };
    }
    throw err;
  }
}

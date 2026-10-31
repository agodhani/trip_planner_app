import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { providerCache, providerCalls } from '@/lib/db/schema';
import { fixtureKey } from './fixtures';
import { ProviderError } from './types';

type CachedCallOpts = {
  provider: string;
  operation: string;
  request: unknown;
  ttlSeconds: number;
  /** Billed units, recorded only on live calls. */
  credits?: number;
  tripId?: string;
  userId?: string;
};

async function recordCall(opts: CachedCallOpts, fields: {
  cacheHit: boolean;
  ok: boolean;
  errorKind?: string;
  durationMs: number;
}) {
  await db.insert(providerCalls).values({
    provider: opts.provider,
    operation: opts.operation,
    cacheHit: fields.cacheHit,
    ok: fields.ok,
    errorKind: fields.errorKind ?? null,
    durationMs: Math.max(0, Math.round(fields.durationMs)),
    credits: fields.cacheHit ? 0 : (opts.credits ?? 0),
    tripId: opts.tripId ?? null,
    userId: opts.userId ?? null,
  });
}

/**
 * Cache + usage tracking for provider calls. On a fresh cache hit the stored
 * normalized result is returned; failures are never cached. Every call is
 * recorded in provider_calls.
 */
export async function cachedCall<T>(
  opts: CachedCallOpts,
  fn: () => Promise<T>,
): Promise<T> {
  // Smoke scripts (SKIP_DB=1) run providers without a database.
  if (process.env.SKIP_DB === '1') return fn();
  const key = fixtureKey(opts.provider, opts.operation, opts.request);
  const now = new Date();

  const existing = await db
    .select({ result: providerCache.result, expiresAt: providerCache.expiresAt })
    .from(providerCache)
    .where(eq(providerCache.key, key))
    .limit(1);

  if (existing[0] && existing[0].expiresAt > now) {
    const started = performance.now();
    await recordCall(opts, {
      cacheHit: true,
      ok: true,
      durationMs: performance.now() - started,
    });
    return existing[0].result as T;
  }

  const started = performance.now();
  try {
    const result = await fn();
    const durationMs = performance.now() - started;
    await db
      .insert(providerCache)
      .values({
        key,
        provider: opts.provider,
        operation: opts.operation,
        request: opts.request,
        result: result as object,
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + opts.ttlSeconds * 1000),
      })
      .onConflictDoUpdate({
        target: providerCache.key,
        set: {
          result: result as object,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + opts.ttlSeconds * 1000),
        },
      });
    await recordCall(opts, { cacheHit: false, ok: true, durationMs });
    return result;
  } catch (err) {
    const durationMs = performance.now() - started;
    await recordCall(opts, {
      cacheHit: false,
      ok: false,
      errorKind: err instanceof ProviderError ? err.kind : 'network',
      durationMs,
    });
    throw err;
  }
}

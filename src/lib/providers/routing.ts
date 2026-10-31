import 'server-only';
import { cachedCall } from './cache';
import { fixturesEnabled } from './fixtures';
import { providerFetch, raiseForStatus, readJson } from './http';
import { ProviderError } from './types';

const PROVIDER = 'osrm';
const TTL_SECONDS = 30 * 24 * 60 * 60;

export type RouteEstimate = {
  mode: 'walk' | 'drive' | 'bike';
  durationMin: number;
  distanceM: number;
};

type OsrmResponse = {
  code?: string;
  routes?: { duration?: number; distance?: number }[];
};

const HOSTS: Record<string, string> = {
  drive: 'https://router.project-osrm.org',
  walk: 'https://routing.openstreetmap.de/routed-foot',
  bike: 'https://routing.openstreetmap.de/routed-bike',
};

// Per-host 1 req/s throttle (skipped under fixture replay).
const lastAt = new Map<string, number>();
const queues = new Map<string, Promise<unknown>>();

function throttled<T>(host: string, fn: () => Promise<T>): Promise<T> {
  if (fixturesEnabled()) return fn();
  const prev = queues.get(host) ?? Promise.resolve();
  const run = prev.then(async () => {
    const wait = Math.max(0, (lastAt.get(host) ?? 0) + 1000 - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt.set(host, Date.now());
    return fn();
  });
  queues.set(host, run.catch(() => undefined));
  return run;
}

async function routeRaw(
  host: string,
  mode: RouteEstimate['mode'],
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<OsrmResponse> {
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${host}/route/v1/driving/${coords}?overview=false`;
  const res = await throttled(host, () =>
    providerFetch(url, {}, {
      provider: PROVIDER,
      operation: `route_${mode}`,
      timeoutMs: 15_000,
      fixtureRequest: { mode, from, to },
    }),
  );
  await raiseForStatus(res, PROVIDER);
  return readJson<OsrmResponse>(res, PROVIDER);
}

/** One route estimate via OSRM (drive) or FOSSGIS (walk/bike). */
export async function routeEstimate(
  mode: RouteEstimate['mode'],
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  opts: { tripId?: string; userId?: string } = {},
): Promise<RouteEstimate | null> {
  const request = { mode, from, to };
  return cachedCall(
    {
      provider: PROVIDER,
      operation: `route_${mode}`,
      request,
      ttlSeconds: TTL_SECONDS,
      tripId: opts.tripId,
      userId: opts.userId,
    },
    async () => {
      const body = await routeRaw(HOSTS[mode], mode, from, to);
      const r = body.routes?.[0];
      if (body.code !== 'Ok' || !r || r.duration === undefined || r.distance === undefined) {
        throw new ProviderError(PROVIDER, 'empty', `${mode} route unavailable`);
      }
      return {
        mode,
        durationMin: Math.round(r.duration / 60),
        distanceM: Math.round(r.distance),
      };
    },
  );
}

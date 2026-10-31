import 'server-only';
import { cachedCall } from './cache';
import { fixturesEnabled } from './fixtures';
import { providerFetch, raiseForStatus, readJson } from './http';

const PROVIDER = 'transitous';
const BASE = 'https://api.transitous.org/api/v5/plan';
const TTL_SECONDS = 7 * 24 * 60 * 60;

export type TransitLeg = {
  mode?: string;
  routeShortName?: string;
  from?: string;
  to?: string;
  startTime?: string;
  endTime?: string;
};

export type TransitPlan = {
  durationMin: number;
  transfers: number;
  summary: string;
  legs: TransitLeg[];
};

type TransitousResponse = {
  itineraries?: {
    duration?: number;
    transfers?: number;
    legs?: {
      mode?: string;
      routeShortName?: string;
      from?: { name?: string };
      to?: { name?: string };
      startTime?: string | number;
      endTime?: string | number;
    }[];
  }[];
};

// 1 req/s process throttle (skipped under fixture replay).
let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  if (fixturesEnabled()) return fn();
  const run = queue.then(async () => {
    const wait = Math.max(0, lastAt + 1000 - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

function iso(t: string | number | undefined): string | undefined {
  if (t === undefined) return undefined;
  const d = typeof t === 'number' ? new Date(t) : new Date(t);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Transit itinerary between two points at a departure instant. */
export async function planTransit(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  timeISO: string,
  opts: { tripId?: string; userId?: string } = {},
): Promise<TransitPlan | null> {
  const request = { from, to, time: timeISO };
  return cachedCall(
    {
      provider: PROVIDER,
      operation: 'plan',
      request,
      ttlSeconds: TTL_SECONDS,
      tripId: opts.tripId,
      userId: opts.userId,
    },
    async () => {
      const qs = new URLSearchParams({
        fromPlace: `${from.lat},${from.lon}`,
        toPlace: `${to.lat},${to.lon}`,
        time: timeISO,
      });
      const res = await throttled(() =>
        providerFetch(`${BASE}?${qs}`, {}, {
          provider: PROVIDER,
          operation: 'plan',
          timeoutMs: 20_000,
          fixtureRequest: request,
        }),
      );
      await raiseForStatus(res, PROVIDER);
      const body = await readJson<TransitousResponse>(res, PROVIDER);
      const it = body.itineraries?.[0];
      if (!it || it.duration === undefined) return null;
      const legs: TransitLeg[] = (it.legs ?? []).map((l) => ({
        mode: l.mode,
        routeShortName: l.routeShortName,
        from: l.from?.name,
        to: l.to?.name,
        startTime: iso(l.startTime),
        endTime: iso(l.endTime),
      }));
      const hops = legs
        .filter((l) => l.routeShortName || (l.mode && l.mode !== 'WALK'))
        .map((l) => `${l.mode ?? ''}${l.routeShortName ? ` ${l.routeShortName}` : ''}`.trim());
      return {
        durationMin: Math.round(it.duration / 60),
        transfers: it.transfers ?? 0,
        summary: hops.join(' → ') || 'walk',
        legs,
      };
    },
  );
}

import 'server-only';
import { userAgent } from '@/lib/env';
import { cachedCall } from '../cache';
import { fixturesEnabled } from '../fixtures';
import { providerFetch, raiseForStatus, readJson } from '../http';
import { ProviderError } from '../types';

const PROVIDER = 'osm';
const BASE = 'https://nominatim.openstreetmap.org';
const GEOCODE_TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days

export type NominatimHit = {
  lat: number;
  lon: number;
  displayName: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
};

// Process-wide throttle: at most 1 request/second (Nominatim usage policy).
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  if (fixturesEnabled()) return fn();
  const run = queue.then(async () => {
    const wait = Math.max(0, lastRequestAt + 1000 - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

type NominatimRaw = {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
};

function toHit(raw: NominatimRaw): NominatimHit {
  return {
    lat: Number(raw.lat),
    lon: Number(raw.lon),
    displayName: raw.display_name,
    type: raw.type,
    class: raw.class,
    address: raw.address,
  };
}

/** Live (or fixture-replayed) Nominatim request — uncached. */
async function nominatimRaw(
  operation: 'geocode' | 'reverse',
  path: string,
  params: Record<string, string | number>,
): Promise<Response> {
  const url = `${BASE}${path}?${new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString()}`;
  const res = await throttled(() =>
    providerFetch(
      url,
      { headers: { 'User-Agent': userAgent() } },
      {
        provider: PROVIDER,
        operation,
        timeoutMs: 15_000,
        fixtureRequest: params,
      },
    ),
  );
  await raiseForStatus(res, PROVIDER);
  return res;
}

export const GEOCODE_PARAMS = (q: string) =>
  ({ format: 'jsonv2', addressdetails: 1, limit: 5, q }) as const;

export const REVERSE_PARAMS = (lat: number, lon: number) =>
  ({ format: 'jsonv2', zoom: 16, addressdetails: 1, lat, lon }) as const;

/** Uncached geocode — used by geocode() and scripts/record-fixtures.ts. */
export async function fetchGeocodeRaw(
  params: Record<string, string | number>,
): Promise<NominatimHit[]> {
  const res = await nominatimRaw('geocode', '/search', params);
  const raw = await readJson<NominatimRaw[]>(res, PROVIDER);
  return raw.map(toHit);
}

export async function fetchReverseRaw(
  params: Record<string, string | number>,
): Promise<NominatimHit | null> {
  const res = await nominatimRaw('reverse', '/reverse', params);
  const raw = await readJson<NominatimRaw | { error?: string }>(res, PROVIDER);
  if (!('lat' in raw)) {
    throw new ProviderError(PROVIDER, 'empty', 'Nominatim reverse: no result');
  }
  return toHit(raw);
}

export async function geocode(q: string): Promise<NominatimHit[]> {
  const request = GEOCODE_PARAMS(q);
  return cachedCall(
    {
      provider: PROVIDER,
      operation: 'geocode',
      request,
      ttlSeconds: GEOCODE_TTL_SECONDS,
    },
    () => fetchGeocodeRaw(request),
  );
}

export async function geocodeFirst(q: string): Promise<NominatimHit | null> {
  const hits = await geocode(q);
  return hits[0] ?? null;
}

export async function reverse(
  lat: number,
  lon: number,
): Promise<NominatimHit | null> {
  const request = REVERSE_PARAMS(lat, lon);
  return cachedCall(
    {
      provider: PROVIDER,
      operation: 'reverse',
      request,
      ttlSeconds: GEOCODE_TTL_SECONDS,
    },
    () => fetchReverseRaw(request),
  );
}

import 'server-only';
import { cachedCall } from '../cache';
import type { PlaceResult } from '../types';
import { ProviderError } from '../types';
import { serpapiGet, SERPAPI_PROVIDER } from './client';

const MAPS_TTL_SECONDS = 7 * 24 * 60 * 60;

export type MapsSearchParams = {
  q: string;
  lat?: number;
  lon?: number;
  zoom?: number; // 3–30, applied via ll
  start?: number; // paging by 20
};

type RawLocal = {
  position?: number;
  title?: string;
  place_id?: string;
  data_id?: string;
  data_cid?: number;
  gps_coordinates?: { latitude?: number; longitude?: number };
  rating?: number;
  reviews?: number;
  price?: string;
  extracted_price?: number;
  type?: string;
  types?: string[];
  type_ids?: string[];
  address?: string;
  open_state?: string;
  hours?: string;
  operating_hours?: Record<string, string>;
  phone?: string;
  website?: string;
  description?: string;
  thumbnail?: string;
};

type MapsResponse = { local_results?: RawLocal[] };

export function normalizeLocal(r: RawLocal): PlaceResult {
  return {
    id: r.place_id ?? r.data_id ?? `pos:${r.position}`,
    title: r.title ?? '',
    type: r.type,
    types: r.types ?? (r.type ? [r.type] : []),
    rating: r.rating,
    reviews: r.reviews,
    priceLevel: r.extracted_price,
    address: r.address,
    lat: r.gps_coordinates?.latitude,
    lon: r.gps_coordinates?.longitude,
    hours: (r.operating_hours ?? {}) as Record<string, unknown>,
    website: r.website,
    phone: r.phone,
    thumbnail: r.thumbnail,
    description: r.description,
  };
}

export async function searchMapsPlaces(
  params: MapsSearchParams,
  opts: { ttlSeconds?: number; tripId?: string; userId?: string } = {},
): Promise<{ places: PlaceResult[] }> {
  const request = { op: 'maps', params };
  try {
    return await cachedCall(
      {
        provider: SERPAPI_PROVIDER,
        operation: 'maps',
        request,
        ttlSeconds: opts.ttlSeconds ?? MAPS_TTL_SECONDS,
        credits: 1,
        tripId: opts.tripId,
        userId: opts.userId,
      },
      async () => {
        const q: Record<string, string | number | boolean> = {
          engine: 'google_maps',
          type: 'search',
          q: params.q,
          hl: 'en',
        };
        if (params.lat !== undefined && params.lon !== undefined) {
          q.ll = `@${params.lat},${params.lon},${params.zoom ?? 13}z`;
        }
        if (params.start) q.start = params.start;
        const body = await serpapiGet<MapsResponse>('maps', q);
        return { places: (body.local_results ?? []).map(normalizeLocal) };
      },
    );
  } catch (err) {
    if (err instanceof ProviderError && err.kind === 'empty') {
      return { places: [] };
    }
    throw err;
  }
}

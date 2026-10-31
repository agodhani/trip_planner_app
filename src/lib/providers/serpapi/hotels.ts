import 'server-only';
import { cachedCall } from '../cache';
import type { LodgingResult } from '../types';
import { ProviderError } from '../types';
import { serpapiGet, SERPAPI_PROVIDER } from './client';

const HOTELS_TTL_SECONDS = 6 * 60 * 60;

export {
  ALL_PROPERTY_TYPE_IDS, AMENITY_IDS, HOTEL_RATING, HOTEL_SORT,
  NON_HOSTEL_TYPE_IDS, PROPERTY_TYPES,
} from './hotel-filters';

export type HotelSearchParams = {
  q: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  adults: number;
  children?: number;
  childrenAges?: number[];
  currency: string;
  sortBy?: number;
  minPrice?: number;
  maxPrice?: number;
  propertyTypes?: number[];
  amenities?: number[];
  rating?: number;
  hotelClass?: number[];
  freeCancellation?: boolean;
  vacationRentals?: boolean;
  bedrooms?: number;
  bathrooms?: number;
  nextPageToken?: string;
};

type RawMoney = { extracted_lowest?: number; extracted_display_price?: number; lowest?: string };

type RawProperty = {
  type?: string;
  name?: string;
  description?: string;
  link?: string;
  property_token?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  check_in_time?: string;
  check_out_time?: string;
  rate_per_night?: RawMoney;
  total_rate?: RawMoney;
  nearby_places?: { name?: string; transportations?: { type?: string; duration?: string }[] }[];
  hotel_class?: string;
  extracted_hotel_class?: number;
  overall_rating?: number;
  reviews?: number;
  location_rating?: number;
  amenities?: string[];
  images?: { thumbnail?: string; original_image?: string }[];
  eco_certified?: boolean;
};

type HotelsResponse = {
  properties?: RawProperty[];
  ads?: RawProperty[];
  search_metadata?: { status?: string };
};

function money(m: RawMoney | undefined): number | undefined {
  return m?.extracted_lowest ?? m?.extracted_display_price;
}

function nearbyText(p: RawProperty): string[] {
  return (p.nearby_places ?? [])
    .map((n) => {
      const t = n.transportations?.[0];
      return n.name ? `${n.name}${t ? ` (${t.duration ?? ''} ${t.type ?? ''})`.trim() : ''}` : null;
    })
    .filter((x): x is string => !!x);
}

export function normalizeProperty(p: RawProperty, currency: string, kind: 'hotel' | 'vacation_rental'): LodgingResult {
  const name = p.name ?? '';
  const desc = `${p.hotel_class ?? ''} ${p.description ?? ''} ${p.type ?? ''}`.toLowerCase();
  const isHostel = /hostel/.test(desc);
  return {
    id: p.property_token ?? `n:${name}`,
    name,
    kind,
    description: p.description,
    lat: p.gps_coordinates?.latitude,
    lon: p.gps_coordinates?.longitude,
    pricePerNight: money(p.rate_per_night),
    totalPrice: money(p.total_rate),
    currency,
    rating: p.overall_rating,
    reviews: p.reviews,
    hotelClass: p.extracted_hotel_class,
    locationRating: p.location_rating,
    amenities: p.amenities ?? [],
    nearbyPlaces: nearbyText(p),
    checkInTime: p.check_in_time,
    checkOutTime: p.check_out_time,
    images: (p.images ?? []).map((i) => i.thumbnail ?? i.original_image ?? '').filter(Boolean),
    link: p.link,
    isHostel,
  };
}

function toQuery(p: HotelSearchParams): Record<string, string | number | boolean> {
  const q: Record<string, string | number | boolean> = {
    engine: 'google_hotels',
    q: p.q,
    check_in_date: p.checkIn,
    check_out_date: p.checkOut,
    adults: p.adults,
    currency: p.currency,
    hl: 'en',
    gl: 'us',
  };
  if (p.vacationRentals) q.vacation_rentals = true;
  if (p.children) q.children = p.children;
  if (p.childrenAges?.length) q.children_ages = p.childrenAges.join(',');
  if (p.sortBy) q.sort_by = p.sortBy;
  if (p.minPrice !== undefined) q.min_price = p.minPrice;
  if (p.maxPrice !== undefined) q.max_price = p.maxPrice;
  if (p.propertyTypes?.length) q.property_types = p.propertyTypes.join(',');
  if (p.amenities?.length) q.amenities = p.amenities.join(',');
  if (p.rating) q.rating = p.rating;
  if (p.hotelClass?.length) q.hotel_class = p.hotelClass.join(',');
  if (p.freeCancellation) q.free_cancellation = true;
  if (p.bedrooms) q.bedrooms = p.bedrooms;
  if (p.bathrooms) q.bathrooms = p.bathrooms;
  if (p.nextPageToken) q.next_page_token = p.nextPageToken;
  return q;
}

export type HotelSearchResult = {
  lodgings: LodgingResult[];
  ads: LodgingResult[];
};

export async function searchHotels(
  params: HotelSearchParams,
  opts: { ttlSeconds?: number; tripId?: string; userId?: string } = {},
): Promise<HotelSearchResult> {
  const request = { op: 'hotels', params };
  try {
    return await cachedCall(
      {
        provider: SERPAPI_PROVIDER,
        operation: 'hotels',
        request,
        ttlSeconds: opts.ttlSeconds ?? HOTELS_TTL_SECONDS,
        credits: 1,
        tripId: opts.tripId,
        userId: opts.userId,
      },
      async () => {
        const body = await serpapiGet<HotelsResponse>('hotels', toQuery(params));
        const kind = params.vacationRentals ? 'vacation_rental' : 'hotel';
        return {
          lodgings: (body.properties ?? []).map((p) => normalizeProperty(p, params.currency, kind)),
          ads: (body.ads ?? []).map((p) => normalizeProperty(p, params.currency, kind)),
        };
      },
    );
  } catch (err) {
    // SerpApi's "no results" body error → empty result set, not a failure.
    if (err instanceof ProviderError && err.kind === 'empty') {
      return { lodgings: [], ads: [] };
    }
    throw err;
  }
}

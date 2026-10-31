import 'server-only';
import { todayISO } from '@/lib/clock';
import { candidatePairs } from '@/lib/domain/dates/strategy';
import { centroid, type GeoPoint } from '@/lib/domain/geo';
import { env } from '@/lib/env';
import { searchHotels, type HotelSearchParams } from '@/lib/providers/serpapi/hotels';
import type { TripRow } from './trips';
import { listOptions } from './options';
import { getTrip } from './trips';
import { assertTripRole, NotFoundError } from './access';
import { addDaysISO } from '@/lib/domain/dates/strategy';

export type StayDates = { checkIn: string; checkOut: string; source: 'flight' | 'trip' | 'strategy' };

/** Check-in/out from the selected flight, explicit trip dates, or the first strategy pair. */
export async function resolveStayDates(trip: TripRow): Promise<StayDates | null> {
  const options = await listOptions(trip.id, 'flight');
  const chosen = options
    .map((o) => o.option)
    .find((o) => o.status === 'selected' || o.status === 'booked');
  const data = chosen?.data as
    | { outbound?: { arriveLocal?: string }; return?: { departLocal?: string } }
    | undefined;
  const inD = data?.outbound?.arriveLocal?.slice(0, 10);
  const outD = data?.return?.departLocal?.slice(0, 10);
  if (inD && outD) return { checkIn: inD, checkOut: outD, source: 'flight' };
  if (inD) return { checkIn: inD, checkOut: addDaysISO(inD, 3), source: 'flight' };

  if (trip.startDate && trip.endDate) {
    return { checkIn: trip.startDate, checkOut: trip.endDate, source: 'trip' };
  }

  const pairs = candidatePairs(trip.dateStrategy, todayISO('UTC'), env.FLIGHT_SCAN_MAX_PAIRS);
  if (pairs.ok && pairs.pairs[0]) {
    const p = pairs.pairs[0];
    return { checkIn: p.depart, checkOut: p.back ?? addDaysISO(p.depart, 3), source: 'strategy' };
  }
  return null;
}

export type NearCenter = { key: string; label: string; point: GeoPoint };

/** Resolved "near" anchors: destination, chosen stay, activities centroid. */
export async function stayCenters(trip: TripRow): Promise<NearCenter[]> {
  const centers: NearCenter[] = [
    { key: 'destination', label: `${trip.destination.city} centre`, point: { lat: trip.destination.lat, lon: trip.destination.lon } },
  ];
  const options = await listOptions(trip.id);
  const rows = options.map((o) => o.option);

  const stay = rows.find(
    (o) => o.kind === 'lodging' && (o.status === 'selected' || o.status === 'booked') && o.lat && o.lon,
  ) ?? rows.find((o) => o.kind === 'lodging' && o.lat && o.lon);
  if (stay?.lat && stay.lon) {
    centers.push({ key: 'stay', label: `Near ${stay.title}`, point: { lat: stay.lat, lon: stay.lon } });
  }

  const acts = rows
    .filter((o) => o.kind === 'activity' && o.status !== 'rejected' && o.lat && o.lon)
    .map((o) => ({ lat: o.lat!, lon: o.lon! }));
  const c = centroid(acts);
  if (c) {
    centers.push({ key: 'activities', label: `Activity cluster (${acts.length})`, point: c });
  }
  return centers;
}

/** Run a SerpApi Google Hotels search for a member. Filters arrive pre-validated. */
export async function runStaySearch(
  user: { id: string },
  tripId: string,
  input: {
    checkIn: string;
    checkOut: string;
    area?: string;
    sortBy?: number;
    minPrice?: number;
    maxPrice?: number;
    propertyTypes?: number[];
    amenities?: number[];
    rating?: number;
    hotelClass?: number[];
    freeCancellation?: boolean;
    vacationRentals?: boolean;
    nextPageToken?: string;
  },
) {
  await assertTripRole(tripId, user.id, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError();

  const children = trip.childrenAges.filter((a) => a <= 17);
  const params: HotelSearchParams = {
    q: input.area ? `${input.area}, ${trip.destination.city}` : trip.destination.city,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: trip.adults,
    children: children.length || undefined,
    childrenAges: children.length ? children.map((a) => Math.max(1, a)) : undefined,
    currency: trip.currency,
    sortBy: input.sortBy,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
    propertyTypes: input.propertyTypes,
    amenities: input.amenities,
    rating: input.rating,
    hotelClass: input.hotelClass,
    freeCancellation: input.freeCancellation,
    vacationRentals: input.vacationRentals,
    nextPageToken: input.nextPageToken,
  };
  return searchHotels(params, { tripId, userId: user.id });
}

import 'server-only';
import { centroid, type GeoPoint } from '@/lib/domain/geo';
import { searchMapsPlaces } from '@/lib/providers/serpapi/maps';
import { assertTripRole, NotFoundError } from './access';
import { listOptions } from './options';
import { getTrip } from './trips';
import type { TripRow } from './trips';

export type ActivityCenter = { key: string; label: string; point: GeoPoint };

/** Resolved search centres: destination, chosen stay, manual pin is client-side. */
export async function activityCenters(trip: TripRow): Promise<ActivityCenter[]> {
  const centers: ActivityCenter[] = [
    {
      key: 'destination',
      label: `${trip.destination.city} centre`,
      point: { lat: trip.destination.lat, lon: trip.destination.lon },
    },
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
  if (c) centers.push({ key: 'activities', label: `Activity cluster (${acts.length})`, point: c });
  return centers;
}

/** SerpApi Google Maps local search centred on an optional point. */
export async function runActivitySearch(
  user: { id: string },
  tripId: string,
  input: { q: string; lat?: number; lon?: number; zoom?: number; start?: number },
) {
  await assertTripRole(tripId, user.id, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError();
  return searchMapsPlaces(
    {
      q: input.q,
      lat: input.lat ?? trip.destination.lat,
      lon: input.lon ?? trip.destination.lon,
      zoom: input.zoom ?? 13,
      start: input.start,
    },
    { tripId, userId: user.id },
  );
}

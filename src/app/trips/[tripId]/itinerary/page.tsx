import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { listItems, listLegs, tripDays } from '@/lib/services/itinerary';
import { listOptions } from '@/lib/services/options';
import { getTrip } from '@/lib/services/trips';
import { ItineraryClient } from '@/components/itinerary-client';

export default async function ItineraryPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [items, legs, pool] = await Promise.all([
    listItems(tripId), listLegs(tripId), listOptions(tripId, 'activity'),
  ]);
  const range = tripDays(trip);
  const onItinerary = new Set(items.map((i) => i.optionId).filter(Boolean));
  const unscheduled = pool
    .map((r) => r.option)
    .filter((o) => o.status !== 'rejected' && !onItinerary.has(o.id))
    .map((o) => ({ id: o.id, title: o.title, lat: o.lat, lon: o.lon }));

  return (
    <ItineraryClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      days={range?.days ?? []}
      items={items.map((i) => ({
        id: i.id, day: i.day, kind: i.kind, title: i.title,
        startTime: i.startTime, endTime: i.endTime, sortOrder: i.sortOrder,
        locked: i.locked, system: i.system, unplanned: i.unplanned,
        notes: i.notes, plannedCost: i.plannedCost ? Number(i.plannedCost) : null,
        lat: (i.location as { lat?: number } | null)?.lat ?? null,
        lon: (i.location as { lon?: number } | null)?.lon ?? null,
      }))}
      legs={legs.map((l) => ({
        id: l.id, fromItemId: l.fromItemId, toItemId: l.toItemId, mode: l.mode,
        durationMin: l.durationMin, summary: l.summary, deepLink: l.deepLink, chosen: l.chosen,
      }))}
      pool={unscheduled}
    />
  );
}

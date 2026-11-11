import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { listItems, listLegs, tripDays } from '@/lib/services/itinerary';
import { listOptions } from '@/lib/services/options';
import { closedWeekdays, hoursWarning, WEEKDAY_SHORT } from '@/lib/domain/opening-hours';
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
  const days = range?.days ?? [];
  const hoursOf = (o: { data: unknown }) => (o.data as { hours?: unknown }).hours;
  const onItinerary = new Set(items.map((i) => i.optionId).filter(Boolean));
  const unscheduled = pool
    .map((r) => r.option)
    .filter((o) => o.status !== 'rejected' && !onItinerary.has(o.id))
    .map((o) => {
      const hours = hoursOf(o);
      const closed = closedWeekdays(hours);
      return {
        id: o.id, title: o.title, lat: o.lat, lon: o.lon,
        closedDays: days.filter((d) => hoursWarning(hours, d)?.kind === 'closed'),
        closedNote: closed.length ? `Closed ${closed.map((w) => WEEKDAY_SHORT[w]).join(', ')}` : null,
      };
    });
  const hoursByOption = new Map(pool.map((r) => [r.option.id, hoursOf(r.option)]));

  return (
    <ItineraryClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      currency={trip.currency}
      days={days}
      items={items.map((i) => ({
        id: i.id, day: i.day, kind: i.kind, title: i.title,
        startTime: i.startTime, endTime: i.endTime, sortOrder: i.sortOrder,
        locked: i.locked, system: i.system, unplanned: i.unplanned,
        notes: i.notes, plannedCost: i.plannedCost ? Number(i.plannedCost) : null,
        lat: (i.location as { lat?: number } | null)?.lat ?? null,
        lon: (i.location as { lon?: number } | null)?.lon ?? null,
        optionId: i.optionId, durationMin: i.durationMin ?? null,
        hoursNote: i.day && i.optionId
          ? hoursWarning(hoursByOption.get(i.optionId), i.day, i.startTime?.slice(0, 5), i.endTime?.slice(0, 5))?.message ?? null
          : null,
      }))}
      legs={legs.map((l) => ({
        id: l.id, fromItemId: l.fromItemId, toItemId: l.toItemId, mode: l.mode,
        durationMin: l.durationMin, summary: l.summary, deepLink: l.deepLink, chosen: l.chosen,
      }))}
      pool={unscheduled}
    />
  );
}

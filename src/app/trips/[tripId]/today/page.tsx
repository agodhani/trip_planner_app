import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { now } from '@/lib/clock';
import { orderDay } from '@/lib/domain/itinerary';
import { safeZone, tripPhase } from '@/lib/domain/today';
import { listItems, listLegs, tripDays } from '@/lib/services/itinerary';
import { getTrip } from '@/lib/services/trips';
import { TodayClient } from '@/components/today-client';

export default async function TodayPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();

  // Item day/start_time/end_time are naive destination-local values by
  // convention, so "now" is resolved in the destination zone — and through
  // the pinnable clock (TP_TEST_NOW) so test runs are deterministic.
  const tz = safeZone(trip.destination.timezone);
  const local = now().setZone(tz);
  const today = local.toFormat('yyyy-MM-dd');
  const nowMin = local.hour * 60 + local.minute;
  const range = tripDays(trip);
  const phase = tripPhase(range, today);

  const [items, legs] = await Promise.all([listItems(tripId), listLegs(tripId)]);
  const locOf = (i: (typeof items)[number]) =>
    i.location as { lat?: number; lon?: number } | null;
  const shape = (i: (typeof items)[number]) => ({
    id: i.id,
    kind: i.kind,
    title: i.title,
    startTime: i.startTime,
    endTime: i.endTime,
    durationMin: i.durationMin,
    sortOrder: i.sortOrder,
    outcome: i.outcome,
    system: i.system,
    notes: i.notes,
    lat: locOf(i)?.lat ?? null,
    lon: locOf(i)?.lon ?? null,
  });

  const todays = orderDay(items.filter((i) => i.day === today));
  // Before the window: preview the first trip day instead of a live plan.
  const previewDay = phase.phase === 'before' ? phase.start : null;
  const preview = previewDay
    ? orderDay(items.filter((i) => i.day === previewDay))
    : [];

  return (
    <TodayClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      today={today}
      nowMin={nowMin}
      timezone={tz}
      phase={phase}
      items={todays.map(shape)}
      previewDay={previewDay}
      previewItems={preview.map(shape)}
      legs={legs.map((l) => ({
        id: l.id,
        fromItemId: l.fromItemId,
        toItemId: l.toItemId,
        mode: l.mode,
        durationMin: l.durationMin,
        summary: l.summary,
        deepLink: l.deepLink,
        chosen: l.chosen,
      }))}
    />
  );
}

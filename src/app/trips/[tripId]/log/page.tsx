import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { todayISO } from '@/lib/clock';
import { orderDay } from '@/lib/domain/itinerary';
import { listItems, tripDays } from '@/lib/services/itinerary';
import { listJournal } from '@/lib/services/expenses';
import { hasRecapContent } from '@/lib/services/recap';
import { getTrip } from '@/lib/services/trips';
import { LogClient } from '@/components/log-client';

export default async function LogPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { user, role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [items, journal, recapReady] = await Promise.all([
    listItems(tripId),
    listJournal(tripId),
    hasRecapContent(trip),
  ]);
  const range = tripDays(trip);
  const today = todayISO(user.homeTimezone);
  const byDay = new Map<string, typeof items>();
  for (const i of items) byDay.set(i.day ?? '', [...(byDay.get(i.day ?? '') ?? []), i]);
  const ordered = [...byDay.values()].flatMap((arr) => orderDay(arr));
  return (
    <LogClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      status={trip.status}
      days={range?.days ?? []}
      defaultDay={range && today >= range.start && today <= range.end ? today : ''}
      items={ordered.map((i) => ({
        id: i.id, day: i.day, title: i.title, kind: i.kind, outcome: i.outcome,
        outcomeNotes: i.outcomeNotes, rating: i.rating, unplanned: i.unplanned,
      }))}
      journal={journal.map(({ j }) => ({ id: j.id, day: j.day, body: j.body }))}
      recapReady={recapReady}
    />
  );
}

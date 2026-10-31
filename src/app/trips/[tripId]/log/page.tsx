import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { listItems } from '@/lib/services/itinerary';
import { listJournal } from '@/lib/services/expenses';
import { getTrip } from '@/lib/services/trips';
import { LogClient } from '@/components/log-client';

export default async function LogPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [items, journal] = await Promise.all([listItems(tripId), listJournal(tripId)]);
  return (
    <LogClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      status={trip.status}
      items={items.map((i) => ({
        id: i.id, day: i.day, title: i.title, kind: i.kind, outcome: i.outcome,
        outcomeNotes: i.outcomeNotes, rating: i.rating, unplanned: i.unplanned,
      }))}
      journal={journal.map(({ j }) => ({ id: j.id, day: j.day, body: j.body }))}
    />
  );
}

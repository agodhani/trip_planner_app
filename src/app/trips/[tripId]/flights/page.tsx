import { requireTripRole } from '@/lib/auth/guards';
import { describeStrategy } from '@/lib/domain/dates/strategy';
import { getTrip } from '@/lib/services/trips';
import { latestSearch } from '@/lib/services/flights';
import { listPairPrefs } from '@/lib/services/date-prefs';
import { listMembers } from '@/lib/services/members';
import { optionPanel } from '@/lib/services/options';
import { notFound } from 'next/navigation';
import { FlightsClient } from '@/components/flights-client';

export default async function FlightsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { user, role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const search = await latestSearch(tripId);
  const options = await optionPanel(tripId, 'flight');
  const [members, datePrefs] = await Promise.all([
    listMembers(tripId),
    listPairPrefs(tripId),
  ]);
  const hasKids = trip.childrenAges.length > 0;

  return (
    <FlightsClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      strategySummary={describeStrategy(trip.dateStrategy, trip.timePrefs)}
      hasKids={hasKids}
      travelers={trip.adults + trip.childrenAges.length}
      initialSearch={search && {
        id: search.id, status: search.status, total: search.total,
        completed: search.completed, result: search.result as never, error: search.error,
        createdAt: search.createdAt.toISOString(),
      }}
      timePrefs={trip.timePrefs}
      options={options}
      currentUserId={user.id}
      members={members.map((m) => ({ userId: m.userId, name: m.name }))}
      datePrefs={datePrefs.map((p) => ({ userId: p.userId, depart: p.depart, back: p.back, value: p.value }))}
    />
  );
}

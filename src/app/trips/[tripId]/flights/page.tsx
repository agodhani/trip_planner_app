import { requireTripRole } from '@/lib/auth/guards';
import { describeStrategy } from '@/lib/domain/dates/strategy';
import { getTrip } from '@/lib/services/trips';
import { latestSearch } from '@/lib/services/flights';
import { listOptionComments, listOptions, listVotes } from '@/lib/services/options';
import { notFound } from 'next/navigation';
import { FlightsClient } from '@/components/flights-client';

export default async function FlightsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const search = await latestSearch(tripId);
  const options = (await listOptions(tripId, 'flight')).map((o) => o.option);
  const votes = await listVotes(options.map((o) => o.id));
  const comments = await listOptionComments(options.map((o) => o.id));
  const hasKids = trip.childrenAges.length > 0;

  return (
    <FlightsClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      strategySummary={describeStrategy(trip.dateStrategy, trip.timePrefs)}
      hasKids={hasKids}
      initialSearch={search && {
        id: search.id, status: search.status, total: search.total,
        completed: search.completed, result: search.result as never, error: search.error,
        createdAt: search.createdAt.toISOString(),
      }}
      timePrefs={trip.timePrefs}
      options={options.map((o) => ({
        id: o.id, title: o.title, subtitle: o.subtitle, status: o.status,
        price: o.priceAmount ? Number(o.priceAmount) : null, currency: o.priceCurrency,
        bookingUrl: o.bookingUrl, bookingRef: o.bookingRef, source: o.source,
        votes: votes.get(o.id) ?? { score: 0, voters: [] },
        comments: comments.filter((c) => c.optionId === o.id).map((c) => ({ id: c.id, body: c.body, author: c.authorName })),
      }))}
    />
  );
}

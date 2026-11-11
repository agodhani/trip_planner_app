import { AppNav } from '@/components/app-nav';
import { MemberAvatars, TripPulse } from '@/components/trip-pulse';
import { TripTabs } from '@/components/trip-tabs';
import { requireTripRole } from '@/lib/auth/guards';
import { todayISO } from '@/lib/clock';
import { describeStrategy } from '@/lib/domain/dates/strategy';
import { safeZone, tripLive, tripPhase } from '@/lib/domain/today';
import { tripDays } from '@/lib/services/itinerary';
import { tripProgress } from '@/lib/services/progress';
import { latestEventId } from '@/lib/services/pulse';
import { hasRecapContent } from '@/lib/services/recap';
import { getTrip, listMemberUsers } from '@/lib/services/trips';
import { dateRange, plural } from '@/lib/ui-format';
import { notFound } from 'next/navigation';

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  booked: 'Booked',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const { user } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [members, progress, initialEventId, recap] = await Promise.all([
    listMemberUsers(tripId),
    tripProgress(trip),
    latestEventId(tripId),
    hasRecapContent(trip),
  ]);
  const state = Object.fromEntries(progress.steps.map((s) => [s.key, s.state]));
  const travelers = trip.adults + trip.childrenAges.length;
  // "Today" is live when the destination-local date sits inside the trip
  // window, or the trip was marked in_progress.
  const range = tripDays(trip);
  const live = tripLive(
    trip.status,
    tripPhase(range, todayISO(safeZone(trip.destination.timezone))),
  );

  return (
    <TripPulse
      tripId={trip.id}
      version={trip.version}
      userId={user.id}
      initialEventId={initialEventId}
    >
      <AppNav user={user} />
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{trip.name}</h1>
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
              {STATUS_LABEL[trip.status] ?? trip.status}
            </span>
            <MemberAvatars members={members} />
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            {trip.origin.city} → {trip.destination.city} ·{' '}
            {trip.startDate
              ? <span className="font-medium text-neutral-800">{dateRange(trip.startDate, trip.endDate)}</span>
              : describeStrategy(trip.dateStrategy, trip.timePrefs)}{' '}
            · {plural(travelers, 'traveler')}
          </p>
          <div className="mt-3">
            <TripTabs
              tripId={trip.id}
              done={{ flights: state.flights === 'done', stay: state.stay === 'done' }}
              shortlistCount={progress.shortlistCount}
              live={live}
              recap={recap}
            />
          </div>
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        {children}
      </main>
    </TripPulse>
  );
}

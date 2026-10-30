import { AppNav } from '@/components/app-nav';
import { LiveRefresh } from '@/components/live-refresh';
import { TripTabs } from '@/components/trip-tabs';
import { requireTripRole } from '@/lib/auth/guards';
import { describeStrategy } from '@/lib/domain/dates/strategy';
import { getTrip, listMemberUsers } from '@/lib/services/trips';
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
  const members = await listMemberUsers(tripId);

  return (
    <>
      <AppNav user={user} />
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{trip.name}</h1>
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
              {STATUS_LABEL[trip.status] ?? trip.status}
            </span>
            <div className="ml-auto flex -space-x-2">
              {members.map((m) => (
                <span
                  key={m.userId}
                  title={`${m.name} (${m.role})`}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-teal-600 text-xs font-semibold text-white"
                >
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            {trip.origin.city} → {trip.destination.city} ·{' '}
            {describeStrategy(trip.dateStrategy, trip.timePrefs)} ·{' '}
            {trip.adults + trip.childrenAges.length} traveler
            {trip.adults + trip.childrenAges.length === 1 ? '' : 's'}
          </p>
          <div className="mt-3">
            <TripTabs tripId={trip.id} />
          </div>
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        {children}
      </main>
      <LiveRefresh tripId={trip.id} version={trip.version} />
    </>
  );
}

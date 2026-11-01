import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AppNav } from '@/components/app-nav';
import { requireUser } from '@/lib/auth/guards';
import type { TripStatus } from '@/lib/db/schema';
import { describeStrategy } from '@/lib/domain/dates/strategy';
import { listTripsForUser, type TripWithRole } from '@/lib/services/trips';
import { dateRange } from '@/lib/ui-format';

const STATUS_ORDER: TripStatus[] = [
  'in_progress',
  'planning',
  'booked',
  'completed',
  'cancelled',
];

const STATUS_LABEL: Record<TripStatus, string> = {
  planning: 'Planning',
  booked: 'Booked',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function TripCard({ trip, role }: TripWithRole) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block rounded-xl border border-neutral-200 bg-white p-4 shadow-sm hover:border-teal-400"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{trip.name}</h3>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          {role}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        {trip.origin.city} → {trip.destination.city}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        {trip.startDate
          ? <span className="font-medium text-neutral-700">{dateRange(trip.startDate, trip.endDate)}</span>
          : describeStrategy(trip.dateStrategy, trip.timePrefs)}
      </p>
    </Link>
  );
}

export default async function TripsPage() {
  const user = await requireUser('/trips');
  const all = await listTripsForUser(user.id);

  return (
    <>
      <AppNav user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your trips</h1>
          <Link
            href="/trips/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" /> New trip
          </Link>
        </div>
        {all.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <p className="font-medium text-neutral-800">No trips yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              Tell us where and roughly when — we&apos;ll find flights, stays, and things to do, then help you build the days.
            </p>
            <Link
              href="/trips/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" /> Plan your first trip
            </Link>
          </div>
        ) : (
          STATUS_ORDER.map((status) => {
            const group = all.filter((t) => t.trip.status === status);
            if (group.length === 0) return null;
            return (
              <section key={status} className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {STATUS_LABEL[status]}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.map((t) => (
                    <TripCard key={t.trip.id} trip={t.trip} role={t.role} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>
    </>
  );
}

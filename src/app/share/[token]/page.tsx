import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BedDouble,
  Bus,
  ExternalLink,
  LogOut,
  MapPin,
  Plane,
  PlaneLanding,
  StickyNote,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { resolveShareToken } from '@/lib/services/share';
import type { ShareView, SharedFlight, SharedStay } from '@/lib/domain/share-view';

export const metadata: Metadata = {
  title: 'Shared trip — TripPlanner',
  robots: { index: false, follow: false },
};

const card = 'rounded-xl border border-neutral-200 bg-white p-5 shadow-sm';

const KIND: Record<string, { icon: LucideIcon; label: string }> = {
  flight_depart: { icon: Plane, label: 'Flight' },
  flight_arrive: { icon: PlaneLanding, label: 'Arrival' },
  checkin: { icon: BedDouble, label: 'Check-in' },
  checkout: { icon: LogOut, label: 'Check-out' },
  activity: { icon: MapPin, label: 'Activity' },
  meal: { icon: Utensils, label: 'Meal' },
  transport: { icon: Bus, label: 'Transport' },
  custom: { icon: StickyNote, label: 'Note' },
};

function StatusChip({ booked }: { booked: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        booked ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700'
      }`}
    >
      {booked ? 'Booked' : 'Selected'}
    </span>
  );
}

function FlightCard({ flight }: { flight: SharedFlight }) {
  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{flight.title}</p>
        <div className="flex items-center gap-2">
          {flight.priceText && (
            <span className="text-sm font-semibold">{flight.priceText}</span>
          )}
          <StatusChip booked={flight.booked} />
        </div>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-neutral-700">
        {flight.legs.map((leg) => (
          <li key={leg.direction} className="flex flex-wrap items-baseline gap-x-2">
            <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-400">
              {leg.direction}
            </span>
            <span className="tabular-nums">
              {leg.dateLabel} · {leg.departTime} {leg.fromCode} → {leg.arriveTime}{' '}
              {leg.toCode}
            </span>
            <span className="text-xs text-neutral-500">
              {leg.durationLabel} · {leg.stopsLabel}
              {leg.airlineLabel ? ` · ${leg.airlineLabel}` : ''}
              {leg.flightNumbers ? ` · ${leg.flightNumbers}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {(flight.bookingRef || flight.bookingUrl) && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          {flight.bookingRef && <span>Confirmation {flight.bookingRef}</span>}
          {flight.bookingUrl && (
            <a
              href={flight.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline"
            >
              Booking link <ExternalLink aria-hidden className="h-3 w-3" />
            </a>
          )}
        </p>
      )}
    </li>
  );
}

function StayCard({ stay }: { stay: SharedStay }) {
  const times = [
    stay.checkInTime ? `check-in from ${stay.checkInTime}` : null,
    stay.checkOutTime ? `check-out by ${stay.checkOutTime}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{stay.name}</p>
        <div className="flex items-center gap-2">
          {stay.priceText && (
            <span className="text-sm font-semibold">{stay.priceText}</span>
          )}
          <StatusChip booked={stay.booked} />
        </div>
      </div>
      {(stay.dateLine || times) && (
        <p className="mt-1 text-sm text-neutral-600">
          {stay.dateLine}
          {stay.dateLine && times ? ' · ' : ''}
          {times}
        </p>
      )}
    </li>
  );
}

function SharedBody({ view }: { view: ShareView }) {
  const empty =
    view.flights.length === 0 && view.stays.length === 0 && view.days.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <section className={card} data-testid="share-header">
        <h1 className="text-xl font-bold">{view.tripName}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {view.routeLine} ·{' '}
          <span className="font-medium text-neutral-800">{view.dateLine}</span>
        </p>
        <p className="mt-0.5 text-sm text-neutral-600">
          Travelers: {view.travelersLine}
        </p>
      </section>

      {empty && (
        <section className={card}>
          <p className="text-sm text-neutral-500">
            Nothing on this itinerary yet — check back once the group adds
            flights, a stay, and plans.
          </p>
        </section>
      )}

      {view.flights.length > 0 && (
        <section className={card} data-testid="share-flights">
          <h2 className="font-semibold">Flights</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {view.flights.map((f) => (
              <FlightCard key={f.id} flight={f} />
            ))}
          </ul>
        </section>
      )}

      {view.stays.length > 0 && (
        <section className={card} data-testid="share-stays">
          <h2 className="font-semibold">Where we&apos;re staying</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {view.stays.map((s) => (
              <StayCard key={s.id} stay={s} />
            ))}
          </ul>
        </section>
      )}

      {view.days.length > 0 && (
        <section className={card} data-testid="share-days">
          <h2 className="font-semibold">Day by day</h2>
          <div className="mt-3 flex flex-col gap-4">
            {view.days.map((d) => (
              <div key={d.day || 'pool'}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {d.label}
                </h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {d.items.map((i) => {
                    const k = KIND[i.kind] ?? KIND.custom;
                    const Icon = k.icon;
                    return (
                      <li key={i.id} className="flex items-baseline gap-2">
                        <span
                          title={k.label}
                          className={`self-center rounded p-1 ${
                            i.system
                              ? 'bg-teal-100 text-teal-700'
                              : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          <Icon aria-hidden className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          {i.timeLabel && (
                            <span className="mr-1.5 text-xs tabular-nums text-neutral-400">
                              {i.timeLabel}
                            </span>
                          )}
                          <span className={i.system ? 'text-neutral-600' : 'font-medium'}>
                            {i.title}
                          </span>
                          {i.notes && (
                            <span className="ml-1.5 text-xs text-neutral-500">
                              · {i.notes}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await resolveShareToken(token);

  if (!view) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="text-xl font-semibold" data-testid="share-unavailable">
          Shared link unavailable
        </h1>
        <p className="text-sm text-neutral-600">
          This shared itinerary link is invalid, has been revoked, or has
          expired. Ask the trip owner for a fresh link.
        </p>
      </main>
    );
  }

  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <SharedBody view={view} />
      </main>
      <footer className="border-t border-neutral-200 py-4">
        <p className="mx-auto max-w-3xl px-6 text-xs text-neutral-400">
          Shared read-only view ·{' '}
          <Link href="/" className="font-medium text-neutral-500 hover:underline">
            TripPlanner
          </Link>
        </p>
      </footer>
    </>
  );
}

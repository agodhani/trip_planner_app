import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { recapToText, type RecapView } from '@/lib/domain/recap';
import { loadRecap } from '@/lib/services/recap';
import { getTrip } from '@/lib/services/trips';
import { RecapActions } from '@/components/recap-actions';
import { money, plural } from '@/lib/ui-format';

const card = 'rounded-xl border border-neutral-200 bg-white p-4 shadow-sm';

const OUTCOME_STYLE: Record<string, string> = {
  done: 'bg-teal-100 text-teal-800',
  skipped: 'bg-neutral-200 text-neutral-600',
  changed: 'bg-amber-100 text-amber-800',
  planned: 'bg-neutral-100 text-neutral-500',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <span className="ml-1 text-xs text-amber-600" aria-label={`${rating} of 5 stars`}>
      {'★'.repeat(rating)}
    </span>
  );
}

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

function RecapBody({ view }: { view: RecapView }) {
  const { header, numbers, timeline, moments, moneySection } = view;
  const cur = moneySection?.currency ?? 'USD';
  const m = (cents: number) => money(cents / 100, cur, 2);
  const empty =
    !numbers && timeline.length === 0 && moments.length === 0 && !moneySection;

  return (
    <div className="flex flex-col gap-6">
      <section className={card} data-testid="recap-header">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{header.name}</h2>
          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
            {header.statusLabel}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          {header.routeLine} · <span className="font-medium text-neutral-800">{header.dateLine}</span>
        </p>
        <p className="mt-0.5 text-sm text-neutral-600">{header.travelersLine}</p>
      </section>

      {empty && (
        <section className={card}>
          <p className="text-sm text-neutral-500">
            Nothing to recap yet — mark outcomes and journal the trip on the Log tab, or log spending
            on the Budget tab, and the story builds itself here.
          </p>
        </section>
      )}

      {numbers && (
        <section className={card} data-testid="recap-numbers">
          <h2 className="font-semibold">By the numbers</h2>
          <p className="mb-3 text-xs text-neutral-500">
            What the plan became: outcomes across every itinerary item, and spend vs. what was committed.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {numbers.dayCount !== null && (
              <StatCell label="Days" value={plural(numbers.dayCount, 'day')} />
            )}
            {numbers.outcomes && (
              <StatCell
                label="Items done"
                value={`${numbers.outcomes.donePct}%`}
                sub={[
                  `${numbers.outcomes.done} of ${plural(numbers.outcomes.total, 'item')}`,
                  numbers.outcomes.skipped ? `${numbers.outcomes.skipped} skipped` : null,
                  numbers.outcomes.changed ? `${numbers.outcomes.changed} changed` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            )}
            {numbers.spentCents !== null && (
              <StatCell
                label="Spent"
                value={m(numbers.spentCents)}
                sub={
                  numbers.plannedCents !== null ? `of ${m(numbers.plannedCents)} planned` : undefined
                }
              />
            )}
            {numbers.perPersonCents !== null && (
              <StatCell label="Per person" value={m(numbers.perPersonCents)} />
            )}
          </div>
          {numbers.topRated && (
            <p className="mt-3 text-sm">
              Top rated: <span className="font-medium">{numbers.topRated.title}</span>
              <Stars rating={numbers.topRated.rating} />
            </p>
          )}
        </section>
      )}

      {timeline.length > 0 && (
        <section className={card} data-testid="recap-timeline">
          <h2 className="font-semibold">Day by day</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Everything that was planned — flights, check-ins and all — with how it turned out.
          </p>
          <div className="flex flex-col gap-4">
            {timeline.map((d) => (
              <div key={d.day || 'pool'}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {d.label}
                </h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {d.items.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="min-w-0 flex-1">
                        {i.timeLabel && (
                          <span className="mr-1.5 text-xs tabular-nums text-neutral-400">
                            {i.timeLabel}
                          </span>
                        )}
                        <span className={i.system ? 'text-neutral-600' : 'font-medium'}>
                          {i.title}
                        </span>
                        <Stars rating={i.rating} />
                        {i.notes && (
                          <span className="ml-1.5 text-xs text-neutral-500">· {i.notes}</span>
                        )}
                      </span>
                      <span
                        className={`rounded px-1.5 text-xs ${OUTCOME_STYLE[i.outcome] ?? 'bg-neutral-100'}`}
                      >
                        {i.outcomeLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {moments.length > 0 && (
        <section className={card} data-testid="recap-moments">
          <h2 className="font-semibold">Top moments</h2>
          <p className="mb-3 text-xs text-neutral-500">
            The 4–5★ highlights and everything the group journaled, in the order they happened.
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {moments.map((mo) => (
              <li key={mo.key} className="flex gap-3">
                <span className="w-20 shrink-0 text-xs font-medium text-neutral-500">
                  {mo.dayLabel}
                </span>
                <span className="min-w-0 flex-1">
                  {mo.kind === 'journal' ? (
                    <>
                      <span className="italic text-neutral-700">“{mo.title}”</span>
                      <span className="text-xs text-neutral-500"> — {mo.author}</span>
                    </>
                  ) : (
                    <>
                      {mo.title}
                      <Stars rating={mo.rating} />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {moneySection && (
        <section className={card} data-testid="recap-money">
          <h2 className="font-semibold">Money</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Logged spending in {cur}, converted at each expense&apos;s own rate.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCell
              label="Spent"
              value={m(moneySection.spentCents)}
              sub={
                moneySection.plannedCents !== null
                  ? `of ${m(moneySection.plannedCents)} planned`
                  : undefined
              }
            />
            {moneySection.perPersonCents !== null && (
              <StatCell label="Per person" value={m(moneySection.perPersonCents)} />
            )}
          </div>
          {moneySection.categories.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {moneySection.categories.map((c) => (
                  <tr key={c.category} className="border-b border-neutral-100">
                    <td className="py-1.5">{cap(c.category)}</td>
                    <td className="py-1.5 text-right font-medium">{m(c.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {moneySection.transfers.length > 0 && (
            <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                To settle up
              </p>
              {moneySection.transfers.map((t, i) => (
                <p key={i}>
                  {t.fromName} pays {t.toName} <span className="font-medium">{m(t.cents)}</span>
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default async function RecapPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const view = await loadRecap(trip);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          The trip, wrapped up — print it or paste it anywhere.
        </p>
        <RecapActions text={recapToText(view)} />
      </div>
      <RecapBody view={view} />
    </div>
  );
}

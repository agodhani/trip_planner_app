'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  BedDouble, Bus, Check, CloudOff, Footprints, LogOut, Map as MapIcon, MapPin,
  PencilLine, Plane, PlaneLanding, SkipForward, StickyNote, Undo2, Utensils,
  type LucideIcon,
} from 'lucide-react';
import { itemOutcomeAction } from '@/lib/actions/budget';
import { DayMap } from '@/components/day-map';
import { ui } from '@/components/shortlisted-options';
import { useToast } from '@/components/toaster';
import {
  fmtMin, planToday,
  type TodayEntry, type TodayItem, type TodayLeg, type TodayOutcome,
  type TripPhase,
} from '@/lib/domain/today';
import { dayLabel, plural } from '@/lib/ui-format';

const { btn, btn2, card } = ui;

export type TodayScreenItem = TodayItem & {
  system: boolean;
  notes: string | null;
  lat: number | null;
  lon: number | null;
};

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

const OUTCOME_STYLE: Record<string, string> = {
  done: 'bg-teal-100 text-teal-800',
  skipped: 'bg-neutral-200 text-neutral-600',
  changed: 'bg-amber-100 text-amber-800',
};

// ----- Offline outcome queue (localStorage, dedupe by itemId, last write wins) -----

type Queued = Record<string, { outcome: TodayOutcome; at: number }>;

const queueKey = (tripId: string) => `today-outcomes:${tripId}`;

function readQueue(tripId: string): Queued {
  try {
    const raw = window.localStorage.getItem(queueKey(tripId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Queued = {};
    for (const [k, v] of Object.entries(parsed)) {
      const o = (v as { outcome?: unknown }).outcome;
      if (o === 'planned' || o === 'done' || o === 'skipped' || o === 'changed') {
        out[k] = { outcome: o, at: Number((v as { at?: unknown }).at) || 0 };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeQueue(tripId: string, q: Queued) {
  try {
    if (Object.keys(q).length) {
      window.localStorage.setItem(queueKey(tripId), JSON.stringify(q));
    } else {
      window.localStorage.removeItem(queueKey(tripId));
    }
  } catch {
    // Storage unavailable — queue degrades to the in-memory mirror.
  }
}

function outcomeForm(tripId: string, itemId: string, outcome: TodayOutcome): FormData {
  const fd = new FormData();
  fd.set('tripId', tripId);
  fd.set('itemId', itemId);
  fd.set('outcome', outcome);
  return fd;
}

// ----- display bits -----

function timeRange(e: TodayEntry): string | null {
  if (e.startMin === null) return null;
  const when = e.item.kind === 'checkin' ? 'from ' : e.item.kind === 'checkout' ? 'by ' : '';
  const span = e.endMin !== null && e.endMin !== e.startMin ? `–${fmtMin(e.endMin)}` : '';
  return `${when}${fmtMin(e.startMin)}${span}`;
}

function LegChip({ leg, dir, otherTitle }: { leg: TodayLeg; dir: 'from' | 'to'; otherTitle: string }) {
  return (
    <span
      title={`${dir === 'from' ? 'From' : 'To'} ${otherTitle}`}
      className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
    >
      <Footprints aria-hidden className="h-3 w-3" />
      {dir} {otherTitle} · {leg.mode}
      {leg.durationMin != null ? ` · ${leg.durationMin} min` : ''}
      {leg.deepLink && (
        <>
          {' · '}
          <a href={leg.deepLink} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">
            directions
          </a>
        </>
      )}
    </span>
  );
}

function OutcomeButtons({ onMark, disabled, large }: {
  onMark: (o: TodayOutcome) => void;
  disabled: boolean;
  large?: boolean;
}) {
  const cls = large ? `${btn} flex-1` : btn2;
  return (
    <span className={`flex gap-1.5 ${large ? 'w-full' : ''}`}>
      <button type="button" disabled={disabled} onClick={() => onMark('done')} className={cls}>
        <Check aria-hidden className="inline h-3.5 w-3.5" /> Done
      </button>
      <button type="button" disabled={disabled} onClick={() => onMark('skipped')} className={cls}>
        <SkipForward aria-hidden className="inline h-3.5 w-3.5" /> Skip
      </button>
      <button type="button" disabled={disabled} onClick={() => onMark('changed')} className={cls}>
        <PencilLine aria-hidden className="inline h-3.5 w-3.5" /> Changed
      </button>
    </span>
  );
}

function PendingChip() {
  return (
    <span
      data-testid="outcome-pending"
      title="Saved offline — syncs when you're back online"
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
    >
      <CloudOff aria-hidden className="h-3 w-3" /> Pending
    </span>
  );
}

function ItemRow({ e, canEdit, busy, queued, itemTitle, onMark }: {
  e: TodayEntry<TodayScreenItem>;
  canEdit: boolean;
  busy: boolean;
  queued: boolean;
  itemTitle: (id: string) => string;
  onMark: (id: string, o: TodayOutcome) => void;
}) {
  const k = KIND[e.item.kind] ?? KIND.custom;
  const Icon = k.icon;
  const t = timeRange(e);
  const done = e.slot === 'done';
  return (
    <li className="rounded-lg border border-neutral-100 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span title={k.label} className={`rounded p-1 ${e.item.system ? 'bg-teal-100 text-teal-700' : 'bg-neutral-100 text-neutral-600'}`}>
          <Icon aria-hidden className="h-3.5 w-3.5" />
        </span>
        <span className={`min-w-0 flex-1 ${done ? 'text-neutral-500' : ''}`}>
          <span className="font-medium">{e.item.title}</span>
          {e.item.system && <span className="ml-1.5 text-xs text-neutral-400">from your booking</span>}
          {e.item.notes && <span className="ml-1.5 text-xs text-neutral-500">· {e.item.notes}</span>}
        </span>
        {t && <span className="shrink-0 text-xs font-medium text-neutral-500">{t}</span>}
        {queued ? <PendingChip /> : done && (
          <span className={`rounded px-1.5 text-xs ${OUTCOME_STYLE[e.item.outcome] ?? 'bg-neutral-100'}`}>{e.item.outcome}</span>
        )}
      </div>
      {(e.legIn || e.legOut) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {e.legIn && <LegChip leg={e.legIn} dir="from" otherTitle={itemTitle(e.legIn.fromItemId)} />}
          {e.legOut && <LegChip leg={e.legOut} dir="to" otherTitle={itemTitle(e.legOut.toItemId)} />}
        </div>
      )}
      {canEdit && (
        <div className="mt-2">
          {done ? (
            <button
              type="button" disabled={busy} onClick={() => onMark(e.item.id, 'planned')}
              className={btn2}
            >
              <Undo2 aria-hidden className="inline h-3.5 w-3.5" /> Back to planned
            </button>
          ) : (
            <OutcomeButtons disabled={busy} onMark={(o) => onMark(e.item.id, o)} />
          )}
        </div>
      )}
    </li>
  );
}

export function TodayClient({ tripId, canEdit, today, nowMin, timezone, phase, items, legs, previewDay, previewItems }: {
  tripId: string;
  canEdit: boolean;
  /** 'YYYY-MM-DD' in the destination timezone. */
  today: string;
  /** Destination-local minutes since midnight, resolved server-side. */
  nowMin: number;
  timezone: string;
  phase: TripPhase;
  items: TodayScreenItem[];
  legs: TodayLeg[];
  /** First trip day when phase is 'before' (preview mode). */
  previewDay: string | null;
  previewItems: TodayScreenItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  // Optimistic outcome overrides (queued writes included); props win once
  // the server render catches up.
  const [overrides, setOverrides] = useState<Record<string, TodayOutcome>>({});
  const [pending, setPending] = useState<Queued>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const enqueue = useCallback((itemId: string, outcome: TodayOutcome) => {
    // Last write wins per item — a later tap replaces the queued outcome.
    const q = { ...readQueue(tripId), [itemId]: { outcome, at: Date.now() } };
    writeQueue(tripId, q);
    setPending(q);
    toast.push('No connection — saved and will sync when back online');
  }, [tripId, toast]);

  /**
   * Flush the queue oldest-first. A failed write while online is dropped —
   * the server state wins (the item may have been deleted, the role revoked,
   * or a collaborator's newer write already landed). Going back offline
   * mid-flush keeps the rest queued for the next 'online' event.
   */
  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const q = readQueue(tripId);
    if (!Object.keys(q).length) return;
    const remaining = { ...q };
    let synced = false;
    for (const [itemId, entry] of Object.entries(q).sort((a, b) => a[1].at - b[1].at)) {
      try {
        await itemOutcomeAction(outcomeForm(tripId, itemId, entry.outcome));
        delete remaining[itemId];
        synced = true;
      } catch {
        if (!navigator.onLine) break;
        delete remaining[itemId];
        setOverrides((o) => {
          const n = { ...o };
          delete n[itemId];
          return n;
        });
      }
    }
    writeQueue(tripId, remaining);
    setPending(remaining);
    if (synced) router.refresh();
  }, [tripId, router]);

  useEffect(() => {
    // Mirror the stored queue into state on mount — same pattern as the
    // unseen-dot restore in trip-pulse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(readQueue(tripId));
    void flush();
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    // Safety net — some environments never fire 'online'.
    const timer = setInterval(() => void flush(), 5_000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [tripId, flush]);

  // Clear overrides once the server props show the same outcome (adjusting
  // state during render — the sanctioned pattern, no effect needed).
  const [seenItems, setSeenItems] = useState(items);
  if (seenItems !== items) {
    setSeenItems(items);
    setOverrides((cur) => {
      let changed = false;
      const next = { ...cur };
      for (const [id, o] of Object.entries(cur)) {
        if (items.find((i) => i.id === id)?.outcome === o) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : cur;
    });
  }

  async function mark(itemId: string, outcome: TodayOutcome) {
    setOverrides((o) => ({ ...o, [itemId]: outcome }));
    if (!navigator.onLine) {
      enqueue(itemId, outcome);
      return;
    }
    setBusy((s) => new Set(s).add(itemId));
    try {
      await itemOutcomeAction(outcomeForm(tripId, itemId, outcome));
      router.refresh();
    } catch {
      enqueue(itemId, outcome);
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(itemId);
        return n;
      });
    }
  }

  const merged = items.map((i) =>
    overrides[i.id] ? { ...i, outcome: overrides[i.id] } : i,
  );
  const plan = planToday(merged, legs, nowMin);
  const titleOf = (id: string) => merged.find((i) => i.id === id)?.title ?? 'a nearby stop';
  const live = phase.phase === 'during' || items.length > 0;

  const rowProps = { canEdit, itemTitle: titleOf, onMark: mark };
  const stateOf = (id: string) => ({ busy: busy.has(id), queued: id in pending });

  const upcomingGaps = plan.gaps.filter((g) => g.untilMin > nowMin);
  const located = merged
    .filter((i): i is TodayScreenItem & { lat: number; lon: number } => i.lat != null && i.lon != null)
    .map((i, n) => ({ id: i.id, lat: i.lat, lon: i.lon, title: i.title, n: n + 1 }));

  const nowEntry = plan.now[0] ?? null;
  const pct = plan.progress.total ? Math.round((plan.progress.done / plan.progress.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5" data-testid="today-screen">
      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-semibold">
              Today{phase.phase === 'during' ? ` — Day ${phase.dayIndex} of ${phase.totalDays}` : ''}
            </h2>
            <p className="text-xs text-neutral-500">
              {dayLabel(today)} · {fmtMin(nowMin)} local ({timezone})
            </p>
          </div>
          {plan.progress.total > 0 && (
            <p data-testid="today-progress" className="text-xs font-medium text-neutral-600">
              {plural(plan.progress.done, 'item')} done · {plan.progress.done} of {plan.progress.total}
            </p>
          )}
        </div>
        {plan.progress.total > 0 && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={plan.progress.total}
            aria-valuenow={plan.progress.done}
            className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100"
          >
            <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </section>

      {phase.phase === 'before' && (
        <section className={card}>
          <h2 className="font-semibold">Starts {dayLabel(phase.start)} — {plural(phase.daysUntil, 'day')} to go</h2>
          <p className="mt-1 text-xs text-neutral-500">The trip hasn&apos;t started yet. Here&apos;s Day 1 as planned:</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {previewItems.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">{i.startTime ? i.startTime.slice(0, 5) : 'anytime'}</span>
                <span className="font-medium">{i.title}</span>
              </li>
            ))}
            {previewItems.length === 0 && (
              <li className="text-xs text-neutral-400">
                Nothing planned for {previewDay ? dayLabel(previewDay) : 'day 1'} yet.
              </li>
            )}
          </ul>
          <Link href={`/trips/${tripId}/itinerary`} className={`${btn2} mt-3 inline-block`}>Plan the itinerary</Link>
        </section>
      )}

      {phase.phase === 'after' && (
        <section className={card}>
          <h2 className="font-semibold">The trip dates ended {dayLabel(phase.end)}</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {phase.daysSince === 1 ? '1 day ago' : `${phase.daysSince} days ago`} — the Log has what actually happened.
          </p>
          <Link href={`/trips/${tripId}/log`} className={`${btn2} mt-3 inline-block`}>Open the Log</Link>
        </section>
      )}

      {phase.phase === 'undated' && (
        <section className={card}>
          <h2 className="font-semibold">No trip dates yet</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Today shows today&apos;s plan once the trip has dates (or is marked in progress).
          </p>
          <Link href={`/trips/${tripId}/itinerary`} className={`${btn2} mt-3 inline-block`}>Open the itinerary</Link>
        </section>
      )}

      {live && (
        <>
          <section className={`${card} border-teal-200`} data-testid="today-now">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-700">Now</h2>
            {nowEntry ? (
              <div className="mt-2">
                <NowCard
                  e={nowEntry}
                  canEdit={canEdit}
                  busy={busy.has(nowEntry.item.id)}
                  queued={nowEntry.item.id in pending}
                  itemTitle={titleOf}
                  onMark={mark}
                />
                {plan.now.slice(1).map((e) => (
                  <p key={e.item.id} className="mt-2 text-xs text-neutral-500">
                    Also on now: <span className="font-medium text-neutral-700">{e.item.title}</span>
                    {timeRange(e) ? ` · ${timeRange(e)}` : ''}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-600">
                Nothing scheduled right now.
                {plan.next ? ` Next: ${plan.next.item.title} at ${fmtMin(plan.next.startMin!)}.` : ''}
              </p>
            )}
            {upcomingGaps.map((g) => (
              <p key={`${g.afterItemId}-${g.untilItemId}`} data-testid="today-gap"
                className="mt-2 flex items-center gap-1 text-xs text-neutral-500">
                <Footprints aria-hidden className="h-3 w-3" />
                {g.active ? 'Now — ' : ''}~{g.freeMin} min free until {fmtMin(g.untilMin)}
              </p>
            ))}
          </section>

          {(plan.next || plan.later.length > 0) && (
            <section className={card} data-testid="today-next">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Next up</h2>
              <ul className="flex flex-col gap-2">
                {[...(plan.next ? [plan.next] : []), ...plan.later].map((e) => (
                  <ItemRow key={e.item.id} e={e} {...rowProps} {...stateOf(e.item.id)} />
                ))}
              </ul>
            </section>
          )}

          {plan.earlier.length > 0 && (
            <section className={card} data-testid="today-earlier">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Earlier today — still unmarked</h2>
              <ul className="flex flex-col gap-2">
                {plan.earlier.map((e) => (
                  <ItemRow key={e.item.id} e={e} {...rowProps} {...stateOf(e.item.id)} />
                ))}
              </ul>
            </section>
          )}

          {plan.anytime.length > 0 && (
            <section className={card} data-testid="today-anytime">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Anytime today</h2>
              <ul className="flex flex-col gap-2">
                {plan.anytime.map((e) => (
                  <ItemRow key={e.item.id} e={e} {...rowProps} {...stateOf(e.item.id)} />
                ))}
              </ul>
            </section>
          )}

          {plan.doneToday.length > 0 && (
            <section className={card} data-testid="today-done">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Done today</h2>
              <ul className="flex flex-col gap-2">
                {plan.doneToday.map((e) => (
                  <ItemRow key={e.item.id} e={e} {...rowProps} {...stateOf(e.item.id)} />
                ))}
              </ul>
            </section>
          )}

          {located.length >= 2 && (
            <section className={card}>
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <MapIcon aria-hidden className="h-3.5 w-3.5" /> Today&apos;s map
              </h2>
              <DayMap points={located} />
            </section>
          )}

          {items.length === 0 && (
            <section className={card}>
              <p className="text-sm text-neutral-600">Nothing on the plan for today.</p>
              <Link href={`/trips/${tripId}/itinerary`} className={`${btn2} mt-3 inline-block`}>Open the itinerary</Link>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function NowCard({ e, canEdit, busy, queued, itemTitle, onMark }: {
  e: TodayEntry<TodayScreenItem>;
  canEdit: boolean;
  busy: boolean;
  queued: boolean;
  itemTitle: (id: string) => string;
  onMark: (id: string, o: TodayOutcome) => void;
}) {
  const k = KIND[e.item.kind] ?? KIND.custom;
  const Icon = k.icon;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span title={k.label} className={`mt-0.5 rounded-lg p-2 ${e.item.system ? 'bg-teal-100 text-teal-700' : 'bg-neutral-100 text-neutral-600'}`}>
            <Icon aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight">{e.item.title}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {k.label}
              {timeRange(e) ? ` · ${timeRange(e)}` : ''}
              {e.item.system ? ' · from your booking' : ''}
            </p>
            {e.item.notes && <p className="mt-1 text-xs text-neutral-600">{e.item.notes}</p>}
          </div>
        </div>
        {queued && <PendingChip />}
      </div>
      {(e.legIn || e.legOut) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {e.legIn && <LegChip leg={e.legIn} dir="from" otherTitle={itemTitle(e.legIn.fromItemId)} />}
          {e.legOut && <LegChip leg={e.legOut} dir="to" otherTitle={itemTitle(e.legOut.toItemId)} />}
        </div>
      )}
      {canEdit && (
        <div className="mt-3">
          <OutcomeButtons large disabled={busy} onMark={(o) => onMark(e.item.id, o)} />
        </div>
      )}
    </div>
  );
}

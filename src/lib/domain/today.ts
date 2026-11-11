/**
 * "Today" travel mode: classify one day's itinerary against the
 * destination-local clock, find free gaps, and track day progress.
 * Pure logic — no I/O, unit-tested.
 *
 * Timezone convention: itinerary_items.day/start_time/end_time are naive
 * columns that mean wall-clock time AT THE TRIP DESTINATION. Callers resolve
 * "now" in trip.destination.timezone and pass it here as minutes since local
 * midnight (`nowMin`). Keeping the clock a parameter is what makes this
 * deterministic — the server page feeds it from the pinnable TP_TEST_NOW-aware
 * clock (src/lib/clock.ts), so e2e classification never depends on real time.
 */

import { DateTime } from 'luxon';
import { orderDay } from './itinerary';

export type TodayOutcome = 'planned' | 'done' | 'skipped' | 'changed';

export type TodayItem = {
  id: string;
  title: string;
  kind: string;
  /** 'HH:mm[:ss]' destination-local, or null = untimed ("anytime"). */
  startTime: string | null;
  endTime: string | null;
  durationMin: number | null;
  sortOrder: number;
  outcome: TodayOutcome;
};

export type TodayLeg = {
  id: string;
  fromItemId: string;
  toItemId: string;
  mode: string;
  durationMin: number | null;
  summary: string | null;
  deepLink: string | null;
  chosen: boolean;
};

/**
 * Slot of a day's item against the clock:
 *  - past: timed, its window has ended, still marked 'planned'
 *  - now: timed and the clock sits inside [start, end]
 *  - next: the first upcoming timed item
 *  - later: upcoming timed items after the next one
 *  - anytime: untimed — never blocks "now"
 *  - done: outcome was recorded (done/skipped/changed), revertible
 */
export type Slot = 'past' | 'now' | 'next' | 'later' | 'anytime' | 'done';

export type TodayEntry<T extends TodayItem = TodayItem> = {
  item: T;
  slot: Slot;
  /** Minutes since local midnight; null for untimed items. */
  startMin: number | null;
  /** End of the item's window: endTime, else start+durationMin, else start. Can exceed 1440 for overnight items. */
  endMin: number | null;
  /** Stored leg from the previous item in day order (chosen preferred). */
  legIn: TodayLeg | null;
  /** Stored leg to the next item in day order (chosen preferred). */
  legOut: TodayLeg | null;
};

export type FreeGap = {
  /** The timed item before the gap. */
  afterItemId: string;
  /** The timed item after the gap. */
  untilItemId: string;
  /** Minutes of unplanned time between them. */
  freeMin: number;
  /** Local minutes of the next item's start (the "until" in "~45 min free until 15:30"). */
  untilMin: number;
  /** The clock sits inside this gap right now. */
  active: boolean;
};

export type TodayPlan<T extends TodayItem = TodayItem> = {
  /** Items whose window contains now — first is the "Now" card; overlaps are possible. */
  now: TodayEntry<T>[];
  /** The next timed item (null when nothing is left today). */
  next: TodayEntry<T> | null;
  /** Upcoming timed items after the next one, in day order. */
  later: TodayEntry<T>[];
  /** Timed items already past but still 'planned' — they still need an outcome. */
  earlier: TodayEntry<T>[];
  /** Untimed planned items — they never block "now". */
  anytime: TodayEntry<T>[];
  /** Items with a recorded outcome (done/skipped/changed), in day order. */
  doneToday: TodayEntry<T>[];
  /** Unplanned minutes between consecutive timed items. */
  gaps: FreeGap[];
  progress: { done: number; total: number };
};

/** 'HH:mm[:ss]' → minutes, or null when absent/unparseable. */
function minsOf(t: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes → 'HH:mm' (wraps past-midnight values for display). */
export function fmtMin(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Classify `dayItems` (one itinerary day, any order — orderDay is applied
 * internally) against `nowMin` minutes since destination-local midnight.
 */
export function planToday<T extends TodayItem>(
  dayItems: T[],
  legs: TodayLeg[],
  nowMin: number,
): TodayPlan<T> {
  const ordered = orderDay(dayItems);
  const legBetween = (a: T | undefined, b: T | undefined): TodayLeg | null => {
    if (!a || !b) return null;
    return (
      legs.find((l) => l.fromItemId === a.id && l.toItemId === b.id && l.chosen) ??
      legs.find((l) => l.fromItemId === a.id && l.toItemId === b.id) ??
      null
    );
  };

  const entries: TodayEntry<T>[] = ordered.map((item, i) => {
    const startMin = minsOf(item.startTime);
    // End of the window: endTime, else start + durationMin, else the start
    // itself (a point event like a flight departure). An endTime at-or-before
    // the start reads as after midnight — same convention as day-timing.ts.
    let endMin: number | null = null;
    if (startMin !== null) {
      const explicit = minsOf(item.endTime);
      endMin =
        explicit !== null
          ? explicit + (explicit <= startMin ? 1440 : 0)
          : item.durationMin != null
            ? startMin + item.durationMin
            : startMin;
    }
    let slot: Slot;
    if (item.outcome !== 'planned') slot = 'done';
    else if (startMin === null) slot = 'anytime';
    else if (nowMin < startMin) slot = 'later'; // relabelled below for the first one
    else if (nowMin <= endMin!) slot = 'now';
    else slot = 'past';
    return {
      item,
      slot,
      startMin,
      endMin,
      legIn: legBetween(ordered[i - 1], item),
      legOut: legBetween(item, ordered[i + 1]),
    };
  });

  const upcoming = entries.filter((e) => e.slot === 'later');
  const next = upcoming[0] ?? null;
  if (next) next.slot = 'next';

  // Free gaps run between consecutive TIMED items — untimed items ordered
  // between them don't consume the gap.
  const timed = entries.filter((e) => e.startMin !== null);
  const gaps: FreeGap[] = [];
  for (let i = 0; i < timed.length - 1; i++) {
    const a = timed[i];
    const b = timed[i + 1];
    const freeMin = b.startMin! - a.endMin!;
    if (freeMin <= 0) continue;
    gaps.push({
      afterItemId: a.item.id,
      untilItemId: b.item.id,
      freeMin,
      untilMin: b.startMin!,
      active: nowMin >= a.endMin! && nowMin < b.startMin!,
    });
  }

  return {
    now: entries.filter((e) => e.slot === 'now'),
    next,
    later: upcoming.slice(1),
    earlier: entries.filter((e) => e.slot === 'past'),
    anytime: entries.filter((e) => e.slot === 'anytime'),
    doneToday: entries.filter((e) => e.slot === 'done'),
    gaps,
    progress: {
      done: entries.filter((e) => e.slot === 'done').length,
      total: entries.length,
    },
  };
}

// ----- trip window ("is the trip live?") -----

export type TripWindow = { start: string; end: string };

export type TripPhase =
  | { phase: 'undated' }
  | { phase: 'before'; daysUntil: number; start: string }
  | { phase: 'during'; dayIndex: number; totalDays: number; start: string; end: string }
  | { phase: 'after'; daysSince: number; end: string };

const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Where `today` (destination-local 'YYYY-MM-DD') sits relative to the trip
 * window. Used by the tab/banner condition and the Today screen's
 * countdown/preview states when the clock is outside the window.
 */
export function tripPhase(range: TripWindow | null, today: string): TripPhase {
  if (!range) return { phase: 'undated' };
  const days = (a: string, b: string) => Math.round((dayMs(b) - dayMs(a)) / 86_400_000);
  if (today < range.start) {
    return { phase: 'before', daysUntil: days(today, range.start), start: range.start };
  }
  if (today > range.end) {
    return { phase: 'after', daysSince: days(range.end, today), end: range.end };
  }
  return {
    phase: 'during',
    dayIndex: days(range.start, today) + 1,
    totalDays: days(range.start, range.end) + 1,
    start: range.start,
    end: range.end,
  };
}

/** The Today tab/banner condition: inside the trip window, or running late. */
export function tripLive(status: string, phase: TripPhase): boolean {
  return status === 'in_progress' || phase.phase === 'during';
}

/**
 * Graceful timezone fallback for trip.destination.timezone — PlaceRef fills
 * it from the airport dataset but it can be missing/bogus on hand-built data.
 */
export function safeZone(tz: string | null | undefined, fallback = 'UTC'): string {
  if (!tz) return fallback;
  return DateTime.now().setZone(tz).isValid ? tz : fallback;
}

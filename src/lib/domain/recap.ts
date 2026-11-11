/**
 * Trip Recap: the read-only view-model behind /trips/[tripId]/recap and its
 * plain-text export. Pure logic — unit-tested, no I/O.
 *
 * Everything is computed from already-loaded lists (itinerary items, journal,
 * expenses, travelers, the resolved day window). Empty sections come back as
 * null/[] so the page can omit them — a recap never renders zero-filled
 * placeholders.
 */

import { orderDay } from './itinerary';
import { settleUp } from './money';
import { dayLabel, dateRange, money, plural } from '@/lib/ui-format';

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  booked: 'Booked',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const OUTCOME_LABEL: Record<string, string> = {
  planned: 'Planned',
  done: 'Done',
  skipped: 'Skipped',
  changed: 'Changed',
};

export type RecapItemInput = {
  id: string;
  day: string | null;
  title: string;
  kind: string;
  startTime: string | null;
  endTime: string | null;
  sortOrder: number;
  outcome: string;
  outcomeNotes: string | null;
  rating: number | null;
  system: boolean;
};

export type RecapJournalInput = {
  id: string;
  day: string | null;
  body: string;
  author: string;
};

export type RecapExpenseInput = {
  id: string;
  description: string;
  category: string;
  /** Expense converted to the trip currency, in integer cents. */
  amountBaseCents: number;
  paidByTravelerId: string;
  shares: { travelerId: string; shareBaseCents: number }[];
};

export type RecapInput = {
  trip: {
    name: string;
    status: string;
    originCity: string;
    destinationCity: string;
    currency: string;
  };
  /** Explicit trip dates; null while the window only comes from a strategy. */
  dates: { start: string; end: string | null } | null;
  /** Strategy description shown instead of dates (describeStrategy). */
  planLabel: string | null;
  /** Resolved trip days ('YYYY-MM-DD' each) used for Day-N labels; [] when undated. */
  days: string[];
  travelers: { id: string; name: string }[];
  items: RecapItemInput[];
  journal: RecapJournalInput[];
  expenses: RecapExpenseInput[];
  /** Committed (selected/booked) option spend, base cents; null when nothing. */
  plannedCents: number | null;
};

export type RecapHeader = {
  name: string;
  statusLabel: string;
  routeLine: string;
  dateLine: string;
  travelersLine: string;
};

export type RecapNumbers = {
  currency: string;
  dayCount: number | null;
  outcomes: {
    done: number;
    skipped: number;
    changed: number;
    planned: number;
    total: number;
    donePct: number;
  } | null;
  topRated: { title: string; rating: number } | null;
  spentCents: number | null;
  plannedCents: number | null;
  perPersonCents: number | null;
};

export type RecapTimelineItem = {
  id: string;
  title: string;
  kind: string;
  /** 'HH:mm' or 'HH:mm–HH:mm'; null for untimed items. */
  timeLabel: string | null;
  outcome: string;
  outcomeLabel: string;
  rating: number | null;
  notes: string | null;
  system: boolean;
};

/** day is 'YYYY-MM-DD' or '' for the unscheduled bucket (always last). */
export type RecapDay = { day: string; label: string; items: RecapTimelineItem[] };

export type RecapMoment = {
  key: string;
  dayLabel: string;
  kind: 'item' | 'journal';
  title: string;
  rating: number | null;
  author: string | null;
};

export type RecapMoney = {
  currency: string;
  spentCents: number;
  plannedCents: number | null;
  perPersonCents: number | null;
  categories: { category: string; totalCents: number }[];
  balances: { name: string; netCents: number }[];
  transfers: { fromName: string; toName: string; cents: number }[];
};

export type RecapView = {
  header: RecapHeader;
  numbers: RecapNumbers | null;
  timeline: RecapDay[];
  moments: RecapMoment[];
  moneySection: RecapMoney | null;
};

const timeLabel = (start: string | null, end: string | null): string | null => {
  const s = start?.slice(0, 5) ?? null;
  const e = end?.slice(0, 5) ?? null;
  if (!s) return null;
  return e && e !== s ? `${s}–${e}` : s;
};

function dayHeading(day: string | null, days: string[]): string {
  if (!day) return 'Unscheduled';
  const i = days.indexOf(day);
  return i >= 0 ? `Day ${i + 1} · ${dayLabel(day)}` : dayLabel(day);
}

export function buildRecap(input: RecapInput): RecapView {
  const { trip, days, travelers, items, journal, expenses } = input;

  // ----- header (always shown) -----
  const names = travelers.map((t) => t.name);
  const header: RecapHeader = {
    name: trip.name,
    statusLabel: STATUS_LABEL[trip.status] ?? trip.status,
    routeLine: `${trip.originCity} → ${trip.destinationCity}`,
    dateLine: input.dates
      ? dateRange(input.dates.start, input.dates.end)
      : input.planLabel ?? 'Dates not set',
    travelersLine:
      names.length > 1 ? names.join(', ') : names[0] ?? 'Solo traveler',
  };

  // ----- timeline: every item (anchors inline), orderDay within each day -----
  const byDay = new Map<string, RecapItemInput[]>();
  for (const i of items) byDay.set(i.day ?? '', [...(byDay.get(i.day ?? '') ?? []), i]);
  const orderedDayKeys = [...byDay.keys()].sort((a, b) =>
    a === '' ? 1 : b === '' ? -1 : a.localeCompare(b),
  );
  const timeline: RecapDay[] = orderedDayKeys.map((day) => ({
    day,
    label: dayHeading(day || null, days),
    items: orderDay(byDay.get(day)!).map((i) => ({
      id: i.id,
      title: i.title,
      kind: i.kind,
      timeLabel: timeLabel(i.startTime, i.endTime),
      outcome: i.outcome,
      outcomeLabel: OUTCOME_LABEL[i.outcome] ?? i.outcome,
      rating: i.rating,
      notes: i.outcomeNotes,
      system: i.system,
    })),
  }));

  // ----- by the numbers -----
  const count = (o: string) => items.filter((i) => i.outcome === o).length;
  const outcomes: RecapNumbers['outcomes'] = items.length
    ? {
        done: count('done'),
        skipped: count('skipped'),
        changed: count('changed'),
        planned: count('planned'),
        total: items.length,
        donePct: Math.round((count('done') / items.length) * 100),
      }
    : null;
  // Top-rated item: highest rating wins; ties go to whichever comes first in
  // the day-by-day order (orderDay inside each day).
  let topRated: RecapNumbers['topRated'] = null;
  for (const d of timeline) {
    for (const i of d.items) {
      if (i.rating !== null && (topRated === null || i.rating > topRated.rating)) {
        topRated = { title: i.title, rating: i.rating };
      }
    }
  }
  const spentCents = expenses.length
    ? expenses.reduce((a, e) => a + e.amountBaseCents, 0)
    : null;
  const perPersonCents =
    spentCents !== null && travelers.length
      ? Math.round(spentCents / travelers.length)
      : null;
  const dayCount = days.length ? days.length : null;
  const numbers: RecapNumbers | null =
    outcomes || topRated || spentCents !== null || dayCount !== null
      ? { currency: trip.currency, dayCount, outcomes, topRated, spentCents, plannedCents: input.plannedCents, perPersonCents }
      : null;

  // ----- top moments: 4–5★ items + journal entries, chronological -----
  // Same-day ordering: items keep their orderDay rank, journal follows (no
  // finer-grained timestamp exists on entries).
  const momentSeq = new Map<string, number>();
  timeline.forEach((d, di) =>
    d.items.forEach((i, ii) => momentSeq.set(i.id, di * 1000 + ii)),
  );
  const jSeq = new Map<string, number>();
  journal.forEach((j, ji) => jSeq.set(j.id, ji));
  const moments: RecapMoment[] = [
    ...items
      .filter((i) => (i.rating ?? 0) >= 4)
      .map((i) => ({
        key: `i:${i.id}`,
        day: i.day ?? '',
        seq: momentSeq.get(i.id) ?? 0,
        dayLabel: i.day ? dayLabel(i.day) : 'Undated',
        kind: 'item' as const,
        title: i.title,
        rating: i.rating,
        author: null,
      })),
    ...journal.map((j) => ({
      key: `j:${j.id}`,
      day: j.day ?? '',
      seq: 10_000 + (jSeq.get(j.id) ?? 0),
      dayLabel: j.day ? dayLabel(j.day) : 'Undated',
      kind: 'journal' as const,
      title: j.body,
      rating: null,
      author: j.author,
    })),
  ].sort(
    (a, b) =>
      (a.day === '' ? 1 : 0) - (b.day === '' ? 1 : 0) ||
      a.day.localeCompare(b.day) ||
      a.seq - b.seq,
  );

  // ----- money: real shares math via settleUp -----
  const nameOf = new Map(travelers.map((t) => [t.id, t.name]));
  let moneySection: RecapMoney | null = null;
  if (expenses.length) {
    const catTotals = new Map<string, number>();
    const net = new Map<string, number>();
    const bump = (id: string, cents: number) => net.set(id, (net.get(id) ?? 0) + cents);
    for (const e of expenses) {
      catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amountBaseCents);
      bump(e.paidByTravelerId, e.amountBaseCents);
      for (const s of e.shares) bump(s.travelerId, -s.shareBaseCents);
    }
    const categories = [...catTotals.entries()]
      .map(([category, totalCents]) => ({ category, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category));
    const balances = [...net.entries()]
      .map(([travelerId, netCents]) => ({
        travelerId,
        netCents,
        name: nameOf.get(travelerId) ?? 'Someone',
      }))
      .filter((b) => b.netCents !== 0);
    const transfers = settleUp(balances).map((t) => ({
      fromName: nameOf.get(t.from) ?? 'Someone',
      toName: nameOf.get(t.to) ?? 'Someone',
      cents: t.cents,
    }));
    moneySection = {
      currency: trip.currency,
      spentCents: spentCents ?? 0,
      plannedCents: input.plannedCents,
      perPersonCents,
      categories,
      balances: balances.map(({ name, netCents }) => ({ name, netCents })),
      transfers,
    };
  }

  return { header, numbers, timeline, moments, moneySection };
}

// ----- plain-text export ("Copy as text") -----

const stars = (rating: number | null) => (rating ? ` ${'★'.repeat(rating)}` : '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function recapToText(view: RecapView): string {
  const { header, numbers, timeline, moments, moneySection } = view;
  const lines: string[] = [
    `${header.name} — ${header.statusLabel}`,
    `${header.routeLine} · ${header.dateLine} · ${header.travelersLine}`,
  ];

  if (numbers) {
    const bits: string[] = [];
    if (numbers.dayCount !== null) bits.push(plural(numbers.dayCount, 'day'));
    if (numbers.outcomes) {
      const o = numbers.outcomes;
      bits.push(`${o.done} of ${plural(o.total, 'item')} done (${o.donePct}%)`);
      if (o.skipped) bits.push(`${o.skipped} skipped`);
      if (o.changed) bits.push(`${o.changed} changed`);
    }
    lines.push('', 'BY THE NUMBERS', bits.join(' · '));
    if (numbers.topRated) {
      lines.push(`Top rated: ${numbers.topRated.title}${stars(numbers.topRated.rating)}`);
    }
    if (numbers.spentCents !== null) {
      const planned =
        numbers.plannedCents !== null ? ` of ${money(numbers.plannedCents / 100, numbers.currency, 0)} planned` : '';
      const each =
        numbers.perPersonCents !== null ? ` · ${money(numbers.perPersonCents / 100, numbers.currency, 2)} per person` : '';
      lines.push(`Spent ${money(numbers.spentCents / 100, numbers.currency, 2)}${planned}${each}`);
    }
  }

  if (timeline.length) {
    lines.push('', 'DAY BY DAY');
    for (const d of timeline) {
      lines.push(d.label);
      for (const i of d.items) {
        const bits = [`  - ${i.timeLabel ? `${i.timeLabel} ` : ''}${i.title}${stars(i.rating)}`];
        const meta = [i.outcome !== 'planned' ? i.outcomeLabel : null, i.notes]
          .filter(Boolean)
          .join(' · ');
        lines.push(`${bits[0]}${meta ? ` — ${meta}` : ''}`);
      }
    }
  }

  if (moments.length) {
    lines.push('', 'TOP MOMENTS');
    for (const m of moments) {
      lines.push(
        m.kind === 'journal'
          ? `${m.dayLabel} · “${m.title}” — ${m.author ?? 'someone'}`
          : `${m.dayLabel} · ${m.title}${stars(m.rating)}`,
      );
    }
  }

  if (moneySection) {
    const m2 = (cents: number) => money(cents / 100, moneySection.currency, 2);
    lines.push('', `MONEY (${moneySection.currency})`);
    lines.push(
      `Spent ${m2(moneySection.spentCents)}${
        moneySection.plannedCents !== null ? ` of ${m2(moneySection.plannedCents)} planned` : ''
      }`,
    );
    if (moneySection.categories.length) {
      lines.push(moneySection.categories.map((c) => `${cap(c.category)} ${m2(c.totalCents)}`).join(' · '));
    }
    for (const t of moneySection.transfers) {
      lines.push(`Settle up: ${t.fromName} pays ${t.toName} ${m2(t.cents)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

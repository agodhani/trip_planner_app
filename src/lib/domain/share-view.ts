/**
 * Public share-link view-model: the ONLY data a /share/[token] page may
 * render. Pure logic — unit-tested, no I/O.
 *
 * Privacy boundary: every field below is picked explicitly, field by field —
 * row objects are never spread into the output. Nothing shaped like
 * budget/expense/split data, journal entries, comments, votes, member
 * emails/roles, or provider internals may appear here.
 * tests/unit/share-view.test.ts serializes the view and walks every key
 * asserting the denylist stays empty.
 */

import {
  fmtMin,
  hhmm,
  isWellFormedLeg,
  plusOne,
  stopsLabel,
  type LegLike,
} from './flight-rows';
import { orderDay } from './itinerary';
import { dayLabel, dateRange, money, nightsBetween, plural } from '@/lib/ui-format';

type Obj = Record<string, unknown>;

const asObj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

// ----- inputs (rows pre-shaped by the service; nothing here is raw jsonb) -----

export type ShareOptionInput = {
  id: string;
  kind: string;
  status: string;
  title: string;
  data: unknown;
  priceAmount: number | null;
  priceCurrency: string | null;
  bookingRef: string | null;
  bookingUrl: string | null;
};

export type ShareItemInput = {
  id: string;
  day: string | null;
  kind: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  sortOrder: number;
  system: boolean;
  notes: string | null;
};

export type ShareViewInput = {
  trip: { name: string; originCity: string; destinationCity: string };
  /** Explicit trip dates; null while the window only comes from a strategy. */
  dates: { start: string; end: string | null } | null;
  /** describeStrategy() output shown instead of dates. */
  planLabel: string | null;
  /** Resolved trip days ('YYYY-MM-DD' each) used for Day-N labels. */
  days: string[];
  /** Traveler display names — only the first name is ever shown. */
  travelerNames: string[];
  /** All trip options; only selected/booked flight + lodging are emitted. */
  options: ShareOptionInput[];
  items: ShareItemInput[];
};

// ----- output (the allowlist — every field rendered on the shared page) -----

export type SharedLeg = {
  direction: 'Outbound' | 'Return';
  dateLabel: string;
  fromCode: string;
  toCode: string;
  departTime: string;
  arriveTime: string;
  durationLabel: string;
  stopsLabel: string;
  /** 'TAP Portugal, Delta' — segment names, falling back to leg codes. */
  airlineLabel: string | null;
  /** 'TP 827, UA 44' when flight numbers exist. */
  flightNumbers: string | null;
};

export type SharedFlight = {
  id: string;
  title: string;
  booked: boolean;
  legs: SharedLeg[];
  priceText: string | null;
  bookingRef: string | null;
  bookingUrl: string | null;
};

export type SharedStay = {
  id: string;
  name: string;
  booked: boolean;
  checkIn: string | null;
  checkOut: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  /** 'Thu, Dec 4 – Mon, Dec 7 · 3 nights' — null when dates are unknown. */
  dateLine: string | null;
  priceText: string | null;
};

export type SharedDayItem = {
  id: string;
  kind: string;
  title: string;
  /** 'HH:mm' or 'HH:mm–HH:mm'; null for untimed items. */
  timeLabel: string | null;
  notes: string | null;
  system: boolean;
};

/** day is 'YYYY-MM-DD', or '' for the unscheduled bucket (always last). */
export type SharedDay = { day: string; label: string; items: SharedDayItem[] };

export type ShareView = {
  tripName: string;
  routeLine: string;
  dateLine: string;
  travelersLine: string;
  flights: SharedFlight[];
  stays: SharedStay[];
  days: SharedDay[];
};

// ----- link lifecycle (also used by the service) -----

/** A share link resolves only while unrevoked and unexpired. */
export function linkIsActive(
  link: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (link.revokedAt !== null) return false;
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

// ----- builders -----

const firstName = (name: string): string => {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] ?? trimmed;
};

/** 'HH:mm' or 'HH:mm–HH:mm'; null for untimed items (same rule as the recap). */
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

const moneyText = (amount: number, currency: string | null): string =>
  money(amount, currency ?? 'USD', Number.isInteger(amount) ? 0 : 2);

function airlineLabel(leg: LegLike): string | null {
  const names = new Set<string>();
  let segmentNames = false;
  for (const s of leg.segments) {
    const seg = asObj(s);
    const n = str(seg?.airlineName) ?? str(seg?.airlineCode);
    if (n) {
      names.add(n);
      segmentNames = true;
    }
  }
  if (!segmentNames) {
    for (const a of leg.airlines) {
      const n = str(a);
      if (n) names.add(n);
    }
  }
  return names.size ? [...names].join(', ') : null;
}

function flightNumbers(leg: LegLike): string | null {
  const nums = new Set<string>();
  for (const s of leg.segments) {
    const seg = asObj(s);
    const code = str(seg?.airlineCode);
    const numStr = str(seg?.flightNumber);
    if (code && numStr) nums.add(`${code} ${numStr}`);
  }
  return nums.size ? [...nums].join(', ') : null;
}

function legView(leg: LegLike, direction: SharedLeg['direction']): SharedLeg {
  return {
    direction,
    dateLabel: dayLabel(leg.departLocal),
    fromCode: leg.from.code,
    toCode: leg.to.code,
    departTime: hhmm(leg.departLocal),
    arriveTime: `${hhmm(leg.arriveLocal)}${plusOne(leg.arriveLocal, leg.segments)}`.trimEnd(),
    durationLabel: fmtMin(leg.durationMin),
    stopsLabel: stopsLabel(leg),
    airlineLabel: airlineLabel(leg),
    flightNumbers: flightNumbers(leg),
  };
}

function flightView(o: ShareOptionInput): SharedFlight {
  const d = asObj(o.data);
  const out = isWellFormedLeg(d?.outbound) ? (d!.outbound as LegLike) : null;
  const back = isWellFormedLeg(d?.return) ? (d!.return as LegLike) : null;
  const price = asObj(d?.price);
  const total = num(price?.total) ?? o.priceAmount;
  const currency = str(price?.currency) ?? o.priceCurrency;
  return {
    id: o.id,
    title: o.title,
    booked: o.status === 'booked',
    legs: [
      ...(out ? [legView(out, 'Outbound')] : []),
      ...(back ? [legView(back, 'Return')] : []),
    ],
    priceText:
      total === null
        ? null
        : `${price?.isFrom === true ? 'from ' : ''}${moneyText(total, currency)}`,
    bookingRef: o.bookingRef,
    bookingUrl: str(o.bookingUrl),
  };
}

function stayView(o: ShareOptionInput): SharedStay {
  const d = asObj(o.data);
  const checkIn = str(d?.checkIn);
  const checkOut = str(d?.checkOut);
  const total = num(d?.totalPrice) ?? o.priceAmount;
  const currency = str(d?.currency) ?? o.priceCurrency;
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  return {
    id: o.id,
    name: o.title,
    booked: o.status === 'booked',
    checkIn,
    checkOut,
    checkInTime: str(d?.checkInTime),
    checkOutTime: str(d?.checkOutTime),
    dateLine: checkIn
      ? `${dateRange(checkIn, checkOut)}${nights > 0 ? ` · ${plural(nights, 'night')}` : ''}`
      : null,
    priceText: total === null ? null : moneyText(total, currency),
  };
}

const CHOSEN = new Set(['selected', 'booked']);

export function buildShareView(input: ShareViewInput): ShareView {
  const { trip, days, options, items } = input;

  const chosen = options.filter((o) => CHOSEN.has(o.status));
  const flights = chosen
    .filter((o) => o.kind === 'flight')
    .map(flightView)
    .sort(
      (a, b) =>
        (a.legs[0]?.departTime ?? '').localeCompare(b.legs[0]?.departTime ?? '') ||
        a.title.localeCompare(b.title),
    );
  const stays = chosen
    .filter((o) => o.kind === 'lodging')
    .map(stayView)
    .sort((a, b) =>
      (a.checkIn ?? '9999').localeCompare(b.checkIn ?? '9999'),
    );

  // Day-by-day: orderDay() within each day, unscheduled bucket last — the
  // same ordering every itinerary-bearing view agrees on.
  const byDay = new Map<string, ShareItemInput[]>();
  for (const i of items) {
    const key = i.day ?? '';
    byDay.set(key, [...(byDay.get(key) ?? []), i]);
  }
  const orderedDayKeys = [...byDay.keys()].sort((a, b) =>
    a === '' ? 1 : b === '' ? -1 : a.localeCompare(b),
  );
  const viewDays: SharedDay[] = orderedDayKeys.map((day) => ({
    day,
    label: dayHeading(day || null, days),
    items: orderDay(byDay.get(day)!).map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      timeLabel: timeLabel(i.startTime, i.endTime),
      notes: i.notes,
      system: i.system,
    })),
  }));

  const names = input.travelerNames.map(firstName).filter(Boolean);
  return {
    tripName: trip.name,
    routeLine: `${trip.originCity} → ${trip.destinationCity}`,
    dateLine: input.dates
      ? dateRange(input.dates.start, input.dates.end)
      : input.planLabel ?? 'Dates not set',
    travelersLine: names.length > 1 ? names.join(', ') : names[0] ?? 'Solo traveler',
    flights,
    stays,
    days: viewDays,
  };
}

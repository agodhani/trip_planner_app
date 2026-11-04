/**
 * Google Maps opening hours (SerpApi `operating_hours`) — pure parsing and
 * checks. Values use minutes after midnight; a close past 1440 runs into the
 * next day. Never throws: unparseable input is 'unknown' and never warns.
 */

export type Weekday =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const WEEKDAYS: Weekday[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

const MINUTES_PER_DAY = 1440;

export type DayHours =
  | { kind: 'closed' }
  | { kind: 'open24' }
  | { kind: 'hours'; intervals: { open: number; close: number }[]; text: string }
  | { kind: 'unknown'; text: string };

type TimeSide = { minutes: number; meridiem: 'AM' | 'PM' | null; hour: number; min: number };

const TIME_RE = /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*$/i;
const RANGE_SPLIT = /[–—-]/;

function parseSide(s: string): TimeSide | null {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  const hour = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const meridiem = (m[3]?.toUpperCase() ?? null) as 'AM' | 'PM' | null;
  if (min > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
  return { minutes: hour * 60 + min, meridiem, hour, min };
}

/** h:mm with an explicit meridiem → minutes after midnight (12 AM = 0, 12 PM = noon). */
const withMeridiem = (h: number, min: number, mer: 'AM' | 'PM') =>
  (h === 12 ? 0 : h) * 60 + min + (mer === 'PM' ? 720 : 0);

function intervalOf(a: TimeSide, b: TimeSide): { open: number; close: number } {
  let open: number;
  let close: number;
  if (b.meridiem && !a.meridiem && a.hour <= 12) {
    // '12:40–7:55 PM': the start inherits the end's meridiem; if that lands
    // after the end it belongs to the other half of the day ('10–2 AM' = 10 PM).
    close = withMeridiem(b.hour, b.min, b.meridiem);
    const same = withMeridiem(a.hour, a.min, b.meridiem);
    open = same <= close ? same : withMeridiem(a.hour, a.min, b.meridiem === 'AM' ? 'PM' : 'AM');
  } else if (a.meridiem) {
    open = withMeridiem(a.hour, a.min, a.meridiem);
    close = b.meridiem
      ? withMeridiem(b.hour, b.min, b.meridiem)
      : b.hour > 12
        ? b.minutes
        : withMeridiem(b.hour, b.min, a.meridiem);
  } else {
    // Both bare ('10:00–19:00') or an un-inheritable start — read as 24-hour.
    open = a.meridiem ? withMeridiem(a.hour, a.min, a.meridiem) : a.minutes;
    close = b.meridiem ? withMeridiem(b.hour, b.min, b.meridiem) : b.minutes;
  }
  if (close <= open) close += MINUTES_PER_DAY; // runs past midnight
  return { open, close };
}

/** '10 AM–7 PM', 'Closed', '9 AM–12 PM, 1–5 PM', 'Open 24 hours' → DayHours. */
export function parseDayHours(raw: string): DayHours {
  const text = String(raw ?? '')
    .replace(/[\u00A0\u2009\u202F]/g, ' ') // narrow/thin/non-breaking spaces
    .replace(/\([^)]*\)/g, '') // holiday notes describe fetch week, not the trip
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { kind: 'unknown', text: '' };
  if (/^closed$/i.test(text)) return { kind: 'closed' };
  if (/^open 24 hours$/i.test(text)) return { kind: 'open24' };
  const intervals: { open: number; close: number }[] = [];
  for (const part of text.split(',')) {
    const sides = part.split(RANGE_SPLIT);
    if (sides.length !== 2) return { kind: 'unknown', text };
    const a = parseSide(sides[0]);
    const b = parseSide(sides[1]);
    if (!a || !b) return { kind: 'unknown', text };
    intervals.push(intervalOf(a, b));
  }
  return intervals.length ? { kind: 'hours', intervals, text } : { kind: 'unknown', text };
}

/** Map weekday → parsed hours; non-objects or missing days are absent. */
export function parseWeek(hours: unknown): Partial<Record<Weekday, DayHours>> {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return {};
  const rec = hours as Record<string, unknown>;
  const out: Partial<Record<Weekday, DayHours>> = {};
  for (const wd of WEEKDAYS) {
    const v = rec[wd];
    if (typeof v === 'string' && v.trim()) out[wd] = parseDayHours(v);
  }
  return out;
}

/** 'YYYY-MM-DD' → weekday (UTC math; trip dates have no timezone). */
export function weekdayOf(iso: string): Weekday {
  return WEEKDAYS[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7];
}

const parseClock = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

/**
 * Warn when a planned item lands on a closed day or outside opening hours.
 * A start time 'HH:mm' is inside the day when one of that day's intervals
 * contains it, or the previous day's past-midnight interval covers t+1440.
 */
export function hoursWarning(
  hours: unknown, day: string, start?: string | null, end?: string | null,
): { kind: 'closed' | 'outside'; message: string } | null {
  const week = parseWeek(hours);
  const wd = weekdayOf(day);
  const dh = week[wd];
  if (!dh || dh.kind === 'unknown' || dh.kind === 'open24') return null;
  const wdLabel = `${wd[0].toUpperCase()}${wd.slice(1)}s`;
  if (dh.kind === 'closed') {
    return { kind: 'closed', message: `Closed on ${wdLabel} (Google Maps hours)` };
  }
  if (!start) return null;
  const t = parseClock(start);
  if (t === null) return null;
  const home = dh.intervals.find((iv) => iv.open <= t && t < iv.close);
  if (home) {
    const te = end ? parseClock(end) : null;
    if (te !== null && te > t && te > home.close) {
      return { kind: 'outside', message: `Open ${dh.text} on ${wdLabel}; ${start}–${end} is outside these hours` };
    }
    return null;
  }
  const prevWd = WEEKDAYS[(WEEKDAYS.indexOf(wd) + 6) % 7];
  const prev = week[prevWd];
  if (prev?.kind === 'hours' && prev.intervals.some((iv) => iv.open <= t + MINUTES_PER_DAY && t + MINUTES_PER_DAY < iv.close)) {
    return null;
  }
  const when = end ? `${start}–${end}` : start;
  return { kind: 'outside', message: `Open ${dh.text} on ${wdLabel}; ${when} is outside these hours` };
}

/** Weekdays the place is closed, Monday-first. */
export function closedWeekdays(hours: unknown): Weekday[] {
  const week = parseWeek(hours);
  return WEEKDAYS.filter((wd) => week[wd]?.kind === 'closed');
}

/** 'Mon–Sat 10 AM–7 PM · Sun Closed' — consecutive identical days grouped. */
export function weekSummary(hours: unknown): string | null {
  const week = parseWeek(hours);
  if (WEEKDAYS.every((wd) => week[wd] === undefined)) return null;
  const labelOf = (wd: Weekday): string => {
    const dh = week[wd];
    if (!dh) return 'Hours vary';
    if (dh.kind === 'closed') return 'Closed';
    if (dh.kind === 'open24') return 'Open 24 hours';
    return dh.text || 'Hours vary';
  };
  const labels = WEEKDAYS.map(labelOf);
  const groups: string[] = [];
  for (let i = 0; i < WEEKDAYS.length;) {
    let j = i;
    while (j + 1 < WEEKDAYS.length && labels[j + 1] === labels[i]) j++;
    groups.push(`${i === j ? WEEKDAY_SHORT[WEEKDAYS[i]] : `${WEEKDAY_SHORT[WEEKDAYS[i]]}–${WEEKDAY_SHORT[WEEKDAYS[j]]}`} ${labels[i]}`);
    i = j + 1;
  }
  return groups.join(' · ');
}

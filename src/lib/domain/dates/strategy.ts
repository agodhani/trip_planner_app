import { DateTime } from 'luxon';

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TimeWindow = { start: string; end: string }; // 'HH:mm', same day

export type TimePrefs = {
  timezone?: string;
  outboundDepart?: TimeWindow;
  returnDepart?: TimeWindow;
};

export type DateStrategy =
  | { kind: 'exact'; departDate: string; returnDate: string | null }
  | {
      kind: 'weekends_in_month';
      month: string; // YYYY-MM
      departWeekday: Weekday;
      departFlexDays: 0 | 1 | 2;
      returnWeekday: Weekday;
      returnFlexDays: 0 | 1 | 2;
    }
  | {
      kind: 'around_date';
      anchorDate: string;
      departFlexDays: 0 | 1 | 2 | 3;
      returnWeekday: Weekday;
      returnFlexDays: 0 | 1 | 2 | 3;
    }
  | {
      kind: 'range';
      earliestDepart: string;
      latestReturn: string;
      minNights: number;
      maxNights: number;
    };

export type DatePair = { depart: string; back: string | null };

/** ISO date + n days → ISO date. */
export function addDaysISO(iso: string, days: number): string {
  return DateTime.fromISO(iso).plus({ days }).toFormat('yyyy-MM-dd');
}

export type CandidatePairsResult =
  | { ok: true; pairs: DatePair[] }
  | { ok: false; error: string; count: number };

const MAX_AHEAD_DAYS = 330;
const DATE_FMT = 'yyyy-MM-dd';

function d(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' }).startOf('day');
}

function fmt(dt: DateTime): string {
  return dt.toFormat(DATE_FMT);
}

/** First date strictly after `anchor` whose ISO weekday is `weekday`. */
function nextWeekdayAfter(anchor: DateTime, weekday: Weekday): DateTime {
  let cur = anchor.plus({ days: 1 });
  while (cur.weekday !== weekday) cur = cur.plus({ days: 1 });
  return cur;
}

function flexDates(center: DateTime, flex: number): DateTime[] {
  const out: DateTime[] = [];
  for (let i = -flex; i <= flex; i++) out.push(center.plus({ days: i }));
  return out;
}

function pairsForAnchors(
  anchors: DateTime[],
  departFlex: number,
  returnWeekday: Weekday,
  returnFlex: number,
): DatePair[] {
  const pairs: DatePair[] = [];
  for (const a of anchors) {
    const r = nextWeekdayAfter(a, returnWeekday);
    for (const depart of flexDates(a, departFlex)) {
      for (const ret of flexDates(r, returnFlex)) {
        if (ret >= depart.plus({ days: 1 })) {
          pairs.push({ depart: fmt(depart), back: fmt(ret) });
        }
      }
    }
  }
  return pairs;
}

function rawPairs(strategy: DateStrategy): DatePair[] {
  switch (strategy.kind) {
    case 'exact':
      return [
        { depart: strategy.departDate, back: strategy.returnDate ?? null },
      ];
    case 'weekends_in_month': {
      const monthStart = d(`${strategy.month}-01`);
      const monthEnd = monthStart.endOf('month');
      const anchors: DateTime[] = [];
      for (
        let cur = monthStart;
        cur <= monthEnd;
        cur = cur.plus({ days: 1 })
      ) {
        if (cur.weekday === strategy.departWeekday) anchors.push(cur);
      }
      return pairsForAnchors(
        anchors,
        strategy.departFlexDays,
        strategy.returnWeekday,
        strategy.returnFlexDays,
      );
    }
    case 'around_date': {
      const anchor = d(strategy.anchorDate);
      return pairsForAnchors(
        [anchor],
        strategy.departFlexDays,
        strategy.returnWeekday,
        strategy.returnFlexDays,
      );
    }
    case 'range': {
      const pairs: DatePair[] = [];
      const latestReturn = d(strategy.latestReturn);
      const lastDepart = latestReturn.minus({ days: strategy.minNights });
      for (
        let depart = d(strategy.earliestDepart);
        depart <= lastDepart;
        depart = depart.plus({ days: 1 })
      ) {
        for (
          let nights = strategy.minNights;
          nights <= strategy.maxNights;
          nights++
        ) {
          const ret = depart.plus({ days: nights });
          if (ret <= latestReturn) {
            pairs.push({ depart: fmt(depart), back: fmt(ret) });
          }
        }
      }
      return pairs;
    }
  }
}

/**
 * Sorted, de-duplicated candidate {depart, return} pairs for a strategy.
 * `today` is 'YYYY-MM-DD' in the user's timezone. Departs before today or
 * more than 330 days out are dropped; if more than maxPairs remain an error
 * naming the count is returned instead of a truncated list.
 */
export function candidatePairs(
  strategy: DateStrategy,
  today: string,
  maxPairs: number,
): CandidatePairsResult {
  const todayDt = d(today);
  const horizon = todayDt.plus({ days: MAX_AHEAD_DAYS });

  const seen = new Set<string>();
  const pairs: DatePair[] = [];
  for (const p of rawPairs(strategy)) {
    const depart = d(p.depart);
    if (depart < todayDt || depart > horizon) continue;
    const key = `${p.depart}|${p.back ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(p);
  }

  pairs.sort(
    (a, b) =>
      a.depart.localeCompare(b.depart) || (a.back ?? '').localeCompare(b.back ?? ''),
  );

  if (pairs.length > maxPairs) {
    return {
      ok: false,
      count: pairs.length,
      error: `This would check ${pairs.length} date combinations — reduce flexibility to at most ${maxPairs}`,
    };
  }
  return { ok: true, pairs };
}

// ----- describeStrategy -----

const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

const TZ_ABBREV: Record<string, string> = {
  'America/New_York': 'ET',
  'America/Chicago': 'CT',
  'America/Denver': 'MT',
  'America/Los_Angeles': 'PT',
  'America/Anchorage': 'AKT',
  'Pacific/Honolulu': 'HT',
};

function fmtTime(hhmm: string): string {
  const dt = DateTime.fromFormat(hhmm, 'HH:mm');
  return dt.toFormat('h:mm a');
}

function flexSuffix(flex: number): string {
  return flex === 0 ? '' : ` ±${flex} day${flex === 1 ? '' : 's'}`;
}

function fmtDate(iso: string): string {
  return d(iso).toFormat('LLL d');
}

function fmtMonth(month: string): string {
  return d(`${month}-01`).toFormat('LLL yyyy');
}

function windowText(label: string, w: TimeWindow | undefined, tz: string): string | null {
  if (!w) return null;
  const z = TZ_ABBREV[tz] ?? tz;
  if (w.start === '00:00' && w.end === '23:59') return null;
  if (w.end === '23:59') {
    return `${label} departs after ${fmtTime(w.start)} ${z}`;
  }
  if (w.start === '00:00') {
    return `${label} departs before ${fmtTime(w.end)} ${z}`;
  }
  return `${label} departs ${fmtTime(w.start)}–${fmtTime(w.end)} ${z}`;
}

export function describeStrategy(
  strategy: DateStrategy,
  prefs?: TimePrefs,
): string {
  const parts: string[] = [];
  switch (strategy.kind) {
    case 'exact':
      parts.push(
        strategy.returnDate
          ? `Exact dates · ${fmtDate(strategy.departDate)} → ${fmtDate(strategy.returnDate)}`
          : `One way on ${fmtDate(strategy.departDate)}`,
      );
      break;
    case 'weekends_in_month':
      parts.push(
        `Weekends in ${fmtMonth(strategy.month)} · leave ${WEEKDAY_SHORT[strategy.departWeekday]}${flexSuffix(strategy.departFlexDays)} · back ${WEEKDAY_SHORT[strategy.returnWeekday]}${flexSuffix(strategy.returnFlexDays)}`,
      );
      break;
    case 'around_date':
      parts.push(
        `Around ${fmtDate(strategy.anchorDate)}${flexSuffix(strategy.departFlexDays)} · back ${WEEKDAY_SHORT[strategy.returnWeekday]}${flexSuffix(strategy.returnFlexDays)}`,
      );
      break;
    case 'range':
      parts.push(
        `${fmtDate(strategy.earliestDepart)} – ${fmtDate(strategy.latestReturn)} · ${strategy.minNights}–${strategy.maxNights} nights`,
      );
      break;
  }
  const tz = prefs?.timezone ?? 'America/New_York';
  const out = windowText('outbound', prefs?.outboundDepart, tz);
  const ret = windowText('return', prefs?.returnDepart, tz);
  if (out) parts.push(out);
  if (ret) parts.push(ret);
  return parts.join(' · ');
}

import { describe, expect, it } from 'vitest';
import {
  candidatePairs,
  describeStrategy,
  type DateStrategy,
} from '@/lib/domain/dates/strategy';

const TODAY = '2026-10-15';
const MAX = 40;

function pairs(r: ReturnType<typeof candidatePairs>) {
  if (!r.ok) throw new Error(r.error);
  return r.pairs;
}

describe('candidatePairs', () => {
  it('Nov 2026 Fri ±1 → Mon ±0 produces exactly the 12 documented pairs', () => {
    const s: DateStrategy = {
      kind: 'weekends_in_month',
      month: '2026-11',
      departWeekday: 5,
      departFlexDays: 1,
      returnWeekday: 1,
      returnFlexDays: 0,
    };
    const got = pairs(candidatePairs(s, TODAY, MAX));
    expect(got).toEqual([
      { depart: '2026-11-05', back: '2026-11-09' },
      { depart: '2026-11-06', back: '2026-11-09' },
      { depart: '2026-11-07', back: '2026-11-09' },
      { depart: '2026-11-12', back: '2026-11-16' },
      { depart: '2026-11-13', back: '2026-11-16' },
      { depart: '2026-11-14', back: '2026-11-16' },
      { depart: '2026-11-19', back: '2026-11-23' },
      { depart: '2026-11-20', back: '2026-11-23' },
      { depart: '2026-11-21', back: '2026-11-23' },
      { depart: '2026-11-26', back: '2026-11-30' },
      { depart: '2026-11-27', back: '2026-11-30' },
      { depart: '2026-11-28', back: '2026-11-30' },
    ]);
  });

  it('flex may spill outside the month boundary', () => {
    // Feb 2026 Sundays: 1, 8, 15, 22. Feb 1 −1 day = Jan 31 (backward spill).
    const back: DateStrategy = {
      kind: 'weekends_in_month',
      month: '2026-02',
      departWeekday: 7,
      departFlexDays: 1,
      returnWeekday: 1,
      returnFlexDays: 0,
    };
    const gotBack = pairs(candidatePairs(back, '2026-01-15', MAX));
    expect(gotBack).toContainEqual({ depart: '2026-01-31', back: '2026-02-02' });
    expect(gotBack).toContainEqual({ depart: '2026-02-01', back: '2026-02-02' });

    // Jan 2026 Saturdays end on Jan 31; +2 days reaches Feb 2 (forward spill).
    const fwd: DateStrategy = {
      kind: 'weekends_in_month',
      month: '2026-01',
      departWeekday: 6,
      departFlexDays: 2,
      returnWeekday: 1,
      returnFlexDays: 0,
    };
    const gotFwd = pairs(candidatePairs(fwd, '2026-01-15', MAX));
    expect(gotFwd).toContainEqual({ depart: '2026-02-01', back: '2026-02-02' });
    expect(gotFwd).toContainEqual({ depart: '2026-01-31', back: '2026-02-02' });

    // Sanity: no duplicates.
    const keys = gotFwd.map((p) => `${p.depart}|${p.back}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('around_date uses a single anchor', () => {
    const s: DateStrategy = {
      kind: 'around_date',
      anchorDate: '2026-11-06',
      departFlexDays: 1,
      returnWeekday: 1,
      returnFlexDays: 0,
    };
    expect(pairs(candidatePairs(s, TODAY, MAX))).toEqual([
      { depart: '2026-11-05', back: '2026-11-09' },
      { depart: '2026-11-06', back: '2026-11-09' },
      { depart: '2026-11-07', back: '2026-11-09' },
    ]);
  });

  it('range produces depart×nights pairs bounded by latestReturn', () => {
    const s: DateStrategy = {
      kind: 'range',
      earliestDepart: '2026-11-01',
      latestReturn: '2026-11-10',
      minNights: 3,
      maxNights: 5,
    };
    const got = pairs(candidatePairs(s, TODAY, MAX));
    expect(got).toContainEqual({ depart: '2026-11-01', back: '2026-11-04' });
    expect(got).toContainEqual({ depart: '2026-11-07', back: '2026-11-10' });
    // Departs stop at latestReturn − minNights = Nov 7; no return past Nov 10.
    expect(got.every((p) => p.depart <= '2026-11-07')).toBe(true);
    expect(got.every((p) => p.back! <= '2026-11-10')).toBe(true);
    expect(got).toHaveLength(18);
  });

  it('exact returns one pair; one-way has a null return', () => {
    const rt: DateStrategy = {
      kind: 'exact',
      departDate: '2026-11-06',
      returnDate: '2026-11-09',
    };
    expect(pairs(candidatePairs(rt, TODAY, MAX))).toEqual([
      { depart: '2026-11-06', back: '2026-11-09' },
    ]);
    const ow: DateStrategy = {
      kind: 'exact',
      departDate: '2026-11-06',
      returnDate: null,
    };
    expect(pairs(candidatePairs(ow, TODAY, MAX))).toEqual([
      { depart: '2026-11-06', back: null },
    ]);
  });

  it('drops departs before today', () => {
    const s: DateStrategy = {
      kind: 'around_date',
      anchorDate: '2026-10-14',
      departFlexDays: 1,
      returnWeekday: 6,
      returnFlexDays: 0,
    };
    const got = pairs(candidatePairs(s, TODAY, MAX));
    // Oct 13 and 14 are before today (Oct 15); only Oct 15 → Sat Oct 17 stays.
    expect(got).toEqual([{ depart: '2026-10-15', back: '2026-10-17' }]);

    const allPast: DateStrategy = {
      kind: 'exact',
      departDate: '2026-01-01',
      returnDate: '2026-01-05',
    };
    expect(pairs(candidatePairs(allPast, TODAY, MAX))).toEqual([]);
  });

  it('returns an over-cap error with the count instead of truncating', () => {
    const s: DateStrategy = {
      kind: 'range',
      earliestDepart: '2026-11-01',
      latestReturn: '2026-12-31',
      minNights: 1,
      maxNights: 14,
    };
    const r = candidatePairs(s, TODAY, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.count).toBeGreaterThan(10);
      expect(r.error).toBe(
        `This would check ${r.count} date combinations — reduce flexibility to at most 10`,
      );
    }
  });
});

describe('describeStrategy', () => {
  it('summarizes weekends_in_month with a return window', () => {
    const s: DateStrategy = {
      kind: 'weekends_in_month',
      month: '2026-11',
      departWeekday: 5,
      departFlexDays: 1,
      returnWeekday: 1,
      returnFlexDays: 0,
    };
    expect(
      describeStrategy(s, {
        timezone: 'America/New_York',
        returnDepart: { start: '17:00', end: '23:59' },
      }),
    ).toBe(
      'Weekends in Nov 2026 · leave Fri ±1 day · back Mon · return departs after 5:00 PM ET',
    );
  });

  it('summarizes exact round-trip and one-way', () => {
    expect(
      describeStrategy({
        kind: 'exact',
        departDate: '2026-11-06',
        returnDate: '2026-11-09',
      }),
    ).toBe('Exact dates · Nov 6 → Nov 9');
    expect(
      describeStrategy({
        kind: 'exact',
        departDate: '2026-11-06',
        returnDate: null,
      }),
    ).toBe('One way on Nov 6');
  });

  it('summarizes around_date and range', () => {
    expect(
      describeStrategy({
        kind: 'around_date',
        anchorDate: '2026-11-06',
        departFlexDays: 2,
        returnWeekday: 1,
        returnFlexDays: 1,
      }),
    ).toBe('Around Nov 6 ±2 days · back Mon ±1 day');
    expect(
      describeStrategy({
        kind: 'range',
        earliestDepart: '2026-11-01',
        latestReturn: '2026-11-30',
        minNights: 3,
        maxNights: 7,
      }),
    ).toBe('Nov 1 – Nov 30 · 3–7 nights');
  });
});

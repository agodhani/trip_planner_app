import { describe, expect, it } from 'vitest';
import {
  aggregatePrefs,
  bestForGroup,
  pairId,
  selectionWarning,
  type DatePairPref,
} from '@/lib/domain/date-prefs';

const pref = (
  userId: string,
  depart: string,
  back: string | null,
  value: DatePairPref['value'],
): DatePairPref => ({ userId, depart, back, value });

const pair = (depart: string, back: string | null, price: number | null) => ({
  depart,
  back,
  price,
});

const members = [
  { userId: 'u1', name: 'Ana' },
  { userId: 'u2', name: 'Bo' },
  { userId: 'u3', name: 'Cid' },
];

describe('pairId', () => {
  it('is stable and uses the empty-back sentinel for one-way pairs', () => {
    expect(pairId({ depart: '2026-12-04', back: '2026-12-07' })).toBe(
      '2026-12-04|2026-12-07',
    );
    expect(pairId({ depart: '2026-12-04', back: null })).toBe('2026-12-04|');
  });
});

describe('aggregatePrefs', () => {
  it('tallies marks per pair and reports honest coverage', () => {
    const prefs = [
      pref('u1', '2026-12-04', '2026-12-07', 'works'),
      pref('u2', '2026-12-04', '2026-12-07', 'maybe'),
      pref('u3', '2026-12-04', '2026-12-07', 'no'),
      pref('u1', '2026-12-11', '2026-12-14', 'works'),
    ];
    const map = aggregatePrefs(prefs, 4);
    expect(map.get('2026-12-04|2026-12-07')).toEqual({
      works: 1,
      maybe: 1,
      no: 1,
      responded: 3,
      memberCount: 4,
    });
    expect(map.get('2026-12-11|2026-12-14')).toEqual({
      works: 1,
      maybe: 0,
      no: 0,
      responded: 1,
      memberCount: 4,
    });
    // Unmarked pairs have no entry — uncommitted members are never implied.
    expect(map.get('2026-12-18|2026-12-21')).toBeUndefined();
  });

  it('distinguishes one-way pairs (null back) from the empty string sentinel', () => {
    const map = aggregatePrefs(
      [pref('u1', '2026-12-04', null, 'works')],
      1,
    );
    expect(map.get('2026-12-04|')?.works).toBe(1);
    expect(map.has('2026-12-04|null')).toBe(false);
  });
});

describe('bestForGroup', () => {
  const pairs = [
    pair('2026-12-04', '2026-12-07', 500),
    pair('2026-12-11', '2026-12-14', 400),
    pair('2026-12-18', '2026-12-21', 300),
  ];

  it('returns null when nobody has responded — never fabricates a winner', () => {
    expect(bestForGroup(pairs, [])).toBeNull();
    // Marks on pairs outside the candidate set are not a response either.
    expect(
      bestForGroup(pairs, [pref('u1', '2027-01-01', '2027-01-04', 'works')]),
    ).toBeNull();
  });

  it('picks the pair with the most works', () => {
    const prefs = [
      pref('u1', '2026-12-04', '2026-12-07', 'works'),
      pref('u2', '2026-12-04', '2026-12-07', 'works'),
      pref('u1', '2026-12-11', '2026-12-14', 'works'),
    ];
    expect(bestForGroup(pairs, prefs)).toBe('2026-12-04|2026-12-07');
  });

  it('breaks a works tie with fewest no', () => {
    const prefs = [
      pref('u1', '2026-12-04', '2026-12-07', 'works'),
      pref('u1', '2026-12-11', '2026-12-14', 'works'),
      pref('u2', '2026-12-04', '2026-12-07', 'no'),
    ];
    expect(bestForGroup(pairs, prefs)).toBe('2026-12-11|2026-12-14');
  });

  it('breaks a marks tie with the cheapest price', () => {
    const tied = [
      pref('u1', '2026-12-04', '2026-12-07', 'maybe'),
      pref('u1', '2026-12-18', '2026-12-21', 'maybe'),
    ];
    // Equal works/no on every candidate — the $300 pair wins.
    expect(bestForGroup(pairs, tied)).toBe('2026-12-18|2026-12-21');
  });

  it('sorts unpriced pairs last on the price tie-break', () => {
    const unpriced = [
      pair('2026-12-04', '2026-12-07', null),
      pair('2026-12-11', '2026-12-14', 400),
    ];
    const prefs = [
      pref('u1', '2026-12-04', '2026-12-07', 'maybe'),
      pref('u1', '2026-12-11', '2026-12-14', 'maybe'),
    ];
    expect(bestForGroup(unpriced, prefs)).toBe('2026-12-11|2026-12-14');
  });

  it('is deterministic on a full tie (earliest depart wins)', () => {
    const prefs = [
      pref('u1', '2026-12-11', '2026-12-14', 'maybe'),
      pref('u1', '2026-12-04', '2026-12-07', 'maybe'),
    ];
    const samePrice = pairs.map((p) => ({ ...p, price: null }));
    expect(bestForGroup(samePrice, prefs)).toBe('2026-12-04|2026-12-07');
  });

  it('handles one-way pairs (back null)', () => {
    const ow = [pair('2026-12-04', null, 100), pair('2026-12-05', null, 200)];
    expect(
      bestForGroup(ow, [pref('u1', '2026-12-05', null, 'works')]),
    ).toBe('2026-12-05|');
  });
});

describe('selectionWarning', () => {
  const prefs = [
    pref('u1', '2026-12-04', '2026-12-07', 'works'),
    pref('u2', '2026-12-04', '2026-12-07', 'no'),
    pref('u3', '2026-12-04', '2026-12-07', 'no'),
    pref('u2', '2026-12-11', '2026-12-14', 'no'),
  ];

  it('names every member who marked the anchored pair as can’t-go', () => {
    expect(
      selectionWarning(
        { depart: '2026-12-04', back: '2026-12-07' },
        prefs,
        members,
      ),
    ).toEqual(['Bo', 'Cid']);
  });

  it('returns null when nobody objected to the pair', () => {
    expect(
      selectionWarning(
        { depart: '2026-12-18', back: '2026-12-21' },
        prefs,
        members,
      ),
    ).toBeNull();
    // works/maybe marks do not warn.
    expect(
      selectionWarning(
        { depart: '2026-12-11', back: '2026-12-14' },
        [pref('u1', '2026-12-11', '2026-12-14', 'works')],
        members,
      ),
    ).toBeNull();
  });

  it('skips marks from non-members and ignores other pairs', () => {
    const withOutsider = [
      ...prefs,
      pref('outsider', '2026-12-11', '2026-12-14', 'no'),
    ];
    expect(
      selectionWarning(
        { depart: '2026-12-11', back: '2026-12-14' },
        withOutsider,
        members,
      ),
    ).toEqual(['Bo']);
  });
});

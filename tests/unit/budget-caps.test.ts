import { describe, expect, it } from 'vitest';
import {
  categoryForOptionKind,
  EXPENSE_CATEGORIES,
  leftFromCap,
  overFromCap,
  perPersonCents,
  rollupsByCategory,
  unpaidCommittedCents,
} from '@/lib/domain/budget';

describe('categoryForOptionKind', () => {
  it('maps every option kind to an expense category', () => {
    expect(categoryForOptionKind('flight')).toBe('flights');
    expect(categoryForOptionKind('lodging')).toBe('lodging');
    expect(categoryForOptionKind('activity')).toBe('activities');
    expect(categoryForOptionKind('transport')).toBe('transport');
    expect(categoryForOptionKind('other')).toBe('other');
  });
  it('defaults unknown kinds to other', () => {
    expect(categoryForOptionKind('spaceship')).toBe('other');
    expect(categoryForOptionKind('')).toBe('other');
  });
  it('only produces valid expense categories', () => {
    for (const kind of ['flight', 'lodging', 'activity', 'transport', 'other', 'x']) {
      expect(EXPENSE_CATEGORIES).toContain(categoryForOptionKind(kind));
    }
  });
});

describe('unpaidCommittedCents', () => {
  it('is the full price when nothing is paid', () => {
    expect(unpaidCommittedCents(50000, 0)).toBe(50000);
  });
  it('keeps the remainder after a partial payment', () => {
    expect(unpaidCommittedCents(50000, 28000)).toBe(22000);
  });
  it('is zero once fully paid', () => {
    expect(unpaidCommittedCents(50000, 50000)).toBe(0);
  });
  it('clamps to zero when overpaid — never goes negative', () => {
    expect(unpaidCommittedCents(50000, 62000)).toBe(0);
  });
  it('is zero for options without a price', () => {
    expect(unpaidCommittedCents(null, 0)).toBe(0);
    expect(unpaidCommittedCents(undefined, 500)).toBe(0);
  });
});

describe('leftFromCap / overFromCap', () => {
  it('is cap minus spent plus committed', () => {
    expect(leftFromCap(40000, 28000, 2000)).toBe(10000);
  });
  it('goes negative when the cap is exceeded', () => {
    expect(leftFromCap(25000, 28000, 2000)).toBe(-5000);
    expect(overFromCap(25000, 28000, 2000)).toBe(5000);
  });
  it('is undefined when there is no cap', () => {
    expect(leftFromCap(undefined, 28000, 2000)).toBeUndefined();
    expect(leftFromCap(null, 28000, 2000)).toBeUndefined();
    expect(overFromCap(undefined, 28000, 2000)).toBeUndefined();
    expect(overFromCap(null, 99999, 0)).toBeUndefined();
  });
  it('treats a zero cap as a real cap — anything committed is over', () => {
    expect(leftFromCap(0, 0, 0)).toBe(0);
    expect(leftFromCap(0, 100, 0)).toBe(-100);
    expect(overFromCap(0, 0, 5000)).toBe(5000);
  });
  it('is not over when spend lands exactly on the cap', () => {
    expect(overFromCap(30000, 30000, 0)).toBe(0);
    expect(leftFromCap(30000, 30000, 0)).toBe(0);
  });
});

describe('rollupsByCategory', () => {
  it('rolls up spent, committed and cap per category', () => {
    const rows = rollupsByCategory(
      { lodging: 25000, flights: 0 },
      { lodging: 28000, food: 1200 },
      { lodging: 2000, flights: 55000 },
    );
    expect(rows).toEqual([
      {
        category: 'flights', capCents: 0, spentCents: 0, committedCents: 55000,
        leftCents: -55000, overCents: 55000,
      },
      {
        category: 'lodging', capCents: 25000, spentCents: 28000, committedCents: 2000,
        leftCents: -5000, overCents: 5000,
      },
      {
        category: 'food', capCents: undefined, spentCents: 1200, committedCents: 0,
        leftCents: undefined, overCents: undefined,
      },
    ]);
  });
  it('keeps enum order regardless of input order', () => {
    const rows = rollupsByCategory(null, { other: 5, flights: 7, food: 3 }, {});
    expect(rows.map((r) => r.category)).toEqual(['flights', 'food', 'other']);
  });
  it('includes cap-only categories so an untouched cap still shows', () => {
    const rows = rollupsByCategory({ food: 9000 }, {}, {});
    expect(rows).toEqual([
      { category: 'food', capCents: 9000, spentCents: 0, committedCents: 0, leftCents: 9000, overCents: 0 },
    ]);
  });
  it('ignores non-enum keys and empty inputs', () => {
    expect(
      rollupsByCategory(
        { nonsense: 100 } as never,
        { bogus: 50 },
        {},
      ),
    ).toEqual([]);
    expect(rollupsByCategory(null, {}, {})).toEqual([]);
  });
  it('leaves left/over undefined for categories without a cap', () => {
    const [row] = rollupsByCategory({ flights: 10000 }, { activities: 700 }, { activities: 300 });
    const uncapped = rollupsByCategory({ flights: 10000 }, { activities: 700 }, { activities: 300 })[1];
    expect(row.leftCents).toBeDefined();
    expect(uncapped).toMatchObject({ category: 'activities', capCents: undefined, leftCents: undefined, overCents: undefined });
  });
});

describe('perPersonCents', () => {
  it('splits evenly and always sums to the total', () => {
    expect(perPersonCents(40000, 4)).toEqual([10000, 10000, 10000, 10000]);
    expect(perPersonCents(100, 3)).toEqual([34, 33, 33]);
    for (const [total, n] of [[1, 7], [999, 4], [123457, 3]] as const) {
      const parts = perPersonCents(total, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it('handles zero travelers and zero totals', () => {
    expect(perPersonCents(5000, 0)).toEqual([]);
    expect(perPersonCents(0, 3)).toEqual([0, 0, 0]);
  });
});

import { describe, expect, it } from 'vitest';
import { equalSplit, fromCents, planSplit, settleUp, toBaseCents, toCents, weightedSplit } from '@/lib/domain/money';

describe('cent helpers', () => {
  it('round-trips cents', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(fromCents(1999)).toBe(19.99);
    expect(toCents(0.005)).toBe(1); // rounds half away from zero
  });
});

describe('toBaseCents', () => {
  it('converts via fx rate', () => {
    expect(toBaseCents(20, 1.08)).toBe(2160);
    expect(toBaseCents(100, 1)).toBe(10000);
  });
  it('rounds to whole cents deterministically', () => {
    expect(toBaseCents(33.33, 1.085)).toBe(3616); // 3616.305
    expect(toBaseCents(33.33, 1.086)).toBe(3620); // 3619.638
  });
});

describe('equalSplit', () => {
  it('splits evenly when divisible', () => {
    expect(equalSplit(900, 3)).toEqual([300, 300, 300]);
  });
  it('gives the cent remainder to the first shares', () => {
    expect(equalSplit(100, 3)).toEqual([34, 33, 33]);
    expect(equalSplit(101, 3)).toEqual([34, 34, 33]);
  });
  it('handles n=1 and always sums to the total', () => {
    expect(equalSplit(777, 1)).toEqual([777]);
    for (const [total, n] of [[1, 7], [999, 4], [5, 6]] as const) {
      const parts = equalSplit(total, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe('settleUp', () => {
  it('pays a single creditor from a single debtor', () => {
    expect(settleUp([
      { travelerId: 'a', netCents: -1000 },
      { travelerId: 'b', netCents: 1000 },
    ])).toEqual([{ from: 'a', to: 'b', cents: 1000 }]);
  });
  it('greedily matches largest debtor to largest creditor', () => {
    const transfers = settleUp([
      { travelerId: 'a', netCents: -3000 },
      { travelerId: 'b', netCents: -1000 },
      { travelerId: 'c', netCents: 2500 },
      { travelerId: 'd', netCents: 1500 },
    ]);
    expect(transfers).toEqual([
      { from: 'a', to: 'c', cents: 2500 },
      { from: 'a', to: 'd', cents: 500 },
      { from: 'b', to: 'd', cents: 1000 },
    ]);
  });
  it('ignores zero balances and settles nothing when all zero', () => {
    expect(settleUp([
      { travelerId: 'a', netCents: 0 },
      { travelerId: 'b', netCents: 0 },
    ])).toEqual([]);
  });
  it('is deterministic regardless of input order', () => {
    const a = settleUp([
      { travelerId: 'a', netCents: -500 },
      { travelerId: 'b', netCents: -500 },
      { travelerId: 'c', netCents: 1000 },
    ]);
    const b = settleUp([
      { travelerId: 'c', netCents: 1000 },
      { travelerId: 'b', netCents: -500 },
      { travelerId: 'a', netCents: -500 },
    ]);
    expect(a).toEqual(b);
  });
});

describe('weightedSplit', () => {
  it('splits 2:1 of 3000 exactly', () => {
    expect(weightedSplit(3000, [2, 1])).toEqual([2000, 1000]);
  });
  it('distributes the remainder to the largest fractions, ties to lower index', () => {
    expect(weightedSplit(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });
  it('handles fractional weights like 1.5:1', () => {
    expect(weightedSplit(1000, [1.5, 1])).toEqual([600, 400]);
  });
  it('gives zero weights nothing', () => {
    expect(weightedSplit(1000, [1, 0, 1])).toEqual([500, 0, 500]);
    expect(weightedSplit(101, [2, 0, 1])).toEqual([67, 0, 34]);
  });
  it('always sums to the total', () => {
    for (const [total, weights] of [
      [1, [1, 1, 1, 1, 1, 1, 1]],
      [999, [3, 7, 2]],
      [4860, [3000, 1500]],
      [5, [0.5, 0.25, 0.25]],
      [123457, [1.5, 2.5, 0.75]],
    ] as const) {
      const parts = weightedSplit(total, [...weights]);
      expect(parts).toHaveLength(weights.length);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it('throws when every weight is zero', () => {
    expect(() => weightedSplit(100, [0, 0])).toThrow();
  });
});

describe('planSplit', () => {
  const A = '00000000-0000-4000-8000-0000000000aa';
  const B = '00000000-0000-4000-8000-0000000000bb';

  it('splits equally among a subset', () => {
    const r = planSplit({ method: 'equal', travelerIds: [A, B, A] }, 1000, 1000, 'USD');
    expect(r).toEqual({ rows: [
      { travelerId: A, shareBaseCents: 500 },
      { travelerId: B, shareBaseCents: 500 },
    ] });
    expect(planSplit({ method: 'equal', travelerIds: [] }, 1000, 1000, 'USD'))
      .toEqual({ error: 'Pick at least one person to split with' });
  });
  it('exact amounts reproduce their cents when there is no FX', () => {
    const r = planSplit(
      { method: 'exact', parts: [{ travelerId: A, cents: 3000 }, { travelerId: B, cents: 1500 }] },
      4500, 4500, 'USD',
    );
    expect(r).toEqual({ rows: [
      { travelerId: A, shareBaseCents: 3000, exactCents: 3000 },
      { travelerId: B, shareBaseCents: 1500, exactCents: 1500 },
    ] });
  });
  it('exact amounts prorate into the base currency under FX', () => {
    const r = planSplit(
      { method: 'exact', parts: [{ travelerId: A, cents: 3000 }, { travelerId: B, cents: 1500 }] },
      4500, 4860, 'USD',
    );
    if ('error' in r) throw new Error(r.error);
    expect(r.rows.reduce((a, x) => a + x.shareBaseCents, 0)).toBe(4860);
    expect(r.rows[0].exactCents).toBe(3000);
  });
  it('rejects exact amounts that do not add up', () => {
    expect(planSplit(
      { method: 'exact', parts: [{ travelerId: A, cents: 3000 }, { travelerId: B, cents: 1000 }] },
      4500, 4500, 'USD',
    )).toEqual({ error: 'Exact amounts add up to $40.00 — they must equal $45.00' });
  });
  it('rejects negative amounts and shares, duplicates and empty splits', () => {
    expect(planSplit({ method: 'exact', parts: [{ travelerId: A, cents: -100 }] }, 100, 100, 'USD'))
      .toEqual({ error: "Amounts can't be negative" });
    expect(planSplit({ method: 'shares', parts: [{ travelerId: A, shares: -1 }] }, 100, 100, 'USD'))
      .toEqual({ error: "Shares can't be negative" });
    expect(planSplit({ method: 'exact', parts: [{ travelerId: A, cents: 50 }, { travelerId: A, cents: 50 }] }, 100, 100, 'USD'))
      .toEqual({ error: 'Each person can only appear once' });
    expect(planSplit({ method: 'exact', parts: [{ travelerId: A, cents: 0 }] }, 100, 100, 'USD'))
      .toEqual({ error: 'Enter at least one amount' });
    expect(planSplit({ method: 'shares', parts: [{ travelerId: A, shares: 0 }] }, 100, 100, 'USD'))
      .toEqual({ error: 'Give at least one person a share' });
  });
  it('splits shares 2:1', () => {
    const r = planSplit(
      { method: 'shares', parts: [{ travelerId: A, shares: 2 }, { travelerId: B, shares: 1 }] },
      3000, 3000, 'USD',
    );
    expect(r).toEqual({ rows: [
      { travelerId: A, shareBaseCents: 2000, shares: 2 },
      { travelerId: B, shareBaseCents: 1000, shares: 1 },
    ] });
  });
});

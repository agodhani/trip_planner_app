import { describe, expect, it } from 'vitest';
import { equalSplit, fromCents, settleUp, toBaseCents, toCents } from '@/lib/domain/money';

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

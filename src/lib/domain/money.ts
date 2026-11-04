/** Money math in integer cents — deterministic, unit-tested. */

import { money } from '@/lib/ui-format';

export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;

/** Convert `amount` in `fromCurrency` to base cents via fx rate. */
export function toBaseCents(amount: number, fxRate: number): number {
  return Math.round(amount * 100 * fxRate);
}

/** Equal split of `totalCents` into n parts; remainder goes to the first shares. */
export function equalSplit(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const rem = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export type Balance = { travelerId: string; netCents: number };
export type Transfer = { from: string; to: string; cents: number };

/**
 * Greedy settle-up: largest debtor pays largest creditor until all nets
 * are zero. Deterministic ordering (net desc, then id).
 */
export function settleUp(balances: Balance[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ id: b.travelerId, cents: -b.netCents }))
    .sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ id: b.travelerId, cents: b.netCents }))
    .sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].cents, creditors[j].cents);
    if (pay > 0) out.push({ from: debtors[i].id, to: creditors[j].id, cents: pay });
    debtors[i].cents -= pay;
    creditors[j].cents -= pay;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return out;
}

/**
 * Largest-remainder split of `totalCents` by arbitrary weights. Weights are
 * scaled to integer myriads so the products stay exact in BigInt; leftover
 * cents go to the largest remainders (ties to the lower index). Zero weights
 * always get 0.
 */
export function weightedSplit(totalCents: number, weights: number[]): number[] {
  const scaled = weights.map((w) => BigInt(Math.round(w * 10000)));
  const total = scaled.reduce((a, b) => a + b, BigInt(0));
  if (total <= BigInt(0)) throw new Error('weightedSplit needs a positive total weight');
  const cents = BigInt(totalCents);
  const parts = scaled.map((w) => {
    const prod = w * cents;
    return { base: prod / total, rem: prod % total };
  });
  const out = parts.map((p) => Number(p.base));
  let remainder = totalCents - out.reduce((a, b) => a + b, 0);
  const order = parts
    .map((p, i) => ({ i, rem: p.rem }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const { i } of order) {
    if (remainder <= 0) break;
    if (scaled[i] === BigInt(0)) continue;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}

export type SplitInput =
  | { method: 'equal'; travelerIds: string[] }
  | { method: 'exact'; parts: { travelerId: string; cents: number }[] }
  | { method: 'shares'; parts: { travelerId: string; shares: number }[] };

export type SplitRow = {
  travelerId: string;
  shareBaseCents: number;
  shares?: number;
  exactCents?: number;
};

/**
 * Plan how an expense splits across travelers. `amountCents` is in the
 * expense currency, `baseCents` in the trip currency — exact amounts are
 * validated against the former and prorated into the latter.
 */
export function planSplit(
  input: SplitInput, amountCents: number, baseCents: number, currency: string,
): { rows: SplitRow[] } | { error: string } {
  if (input.method === 'equal') {
    const ids = [...new Set(input.travelerIds)];
    if (ids.length === 0) return { error: 'Pick at least one person to split with' };
    return {
      rows: equalSplit(baseCents, ids.length)
        .map((shareBaseCents, i) => ({ travelerId: ids[i], shareBaseCents })),
    };
  }
  const seen = new Set<string>();
  for (const p of input.parts) {
    if (seen.has(p.travelerId)) return { error: 'Each person can only appear once' };
    seen.add(p.travelerId);
  }
  if (input.method === 'exact') {
    if (input.parts.some((p) => !Number.isInteger(p.cents) || p.cents < 0)) {
      return { error: "Amounts can't be negative" };
    }
    const parts = input.parts.filter((p) => p.cents > 0);
    if (parts.length === 0) return { error: 'Enter at least one amount' };
    const sum = parts.reduce((a, p) => a + p.cents, 0);
    if (sum !== amountCents) {
      return {
        error: `Exact amounts add up to ${money(sum / 100, currency, 2)} — they must equal ${money(amountCents / 100, currency, 2)}`,
      };
    }
    const bases = weightedSplit(baseCents, parts.map((p) => p.cents));
    return {
      rows: parts.map((p, i) => ({ travelerId: p.travelerId, shareBaseCents: bases[i], exactCents: p.cents })),
    };
  }
  if (input.parts.some((p) => !Number.isFinite(p.shares) || p.shares < 0)) {
    return { error: "Shares can't be negative" };
  }
  const parts = input.parts.filter((p) => p.shares > 0);
  if (parts.length === 0) return { error: 'Give at least one person a share' };
  const bases = weightedSplit(baseCents, parts.map((p) => p.shares));
  return {
    rows: parts.map((p, i) => ({ travelerId: p.travelerId, shareBaseCents: bases[i], shares: p.shares })),
  };
}

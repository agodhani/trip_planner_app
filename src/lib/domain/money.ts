/** Money math in integer cents — deterministic, unit-tested. */

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

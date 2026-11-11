/**
 * Trip budget caps and the booked→spent bridge — pure integer-cent math, no
 * I/O. The category/kind lists mirror the expense_category and option_kind
 * pgEnums; they are duplicated here (rather than imported from db/schema) so
 * this module stays safe to import from client components.
 */

import { weightedSplit } from './money';

export const EXPENSE_CATEGORIES = [
  'flights',
  'lodging',
  'food',
  'activities',
  'transport',
  'shopping',
  'fees',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const OPTION_KINDS = [
  'flight',
  'lodging',
  'activity',
  'transport',
  'other',
] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

/** option_kind → the expense_category its bookings are logged under. */
export const KIND_CATEGORY: Record<OptionKind, ExpenseCategory> = {
  flight: 'flights',
  lodging: 'lodging',
  activity: 'activities',
  transport: 'transport',
  other: 'other',
};

export function categoryForOptionKind(kind: string): ExpenseCategory {
  return (KIND_CATEGORY as Record<string, ExpenseCategory>)[kind] ?? 'other';
}

export type CategoryCaps = Partial<Record<ExpenseCategory, number>>;

/**
 * The still-owed remainder of a committed (selected/booked) option once the
 * expenses linked to it are counted. Overpaying clamps to 0 — the overshoot
 * is real spend and shows up via the expense itself.
 */
export function unpaidCommittedCents(
  optionPriceCents: number | null | undefined,
  linkedExpenseCents: number,
): number {
  return Math.max(0, (optionPriceCents ?? 0) - linkedExpenseCents);
}

/** cap − (spent + committed); undefined when there is no cap. */
export function leftFromCap(
  capCents: number | null | undefined,
  spentCents: number,
  committedCents: number,
): number | undefined {
  if (capCents === null || capCents === undefined) return undefined;
  return capCents - spentCents - committedCents;
}

/** max(0, spent + committed − cap); undefined when there is no cap. */
export function overFromCap(
  capCents: number | null | undefined,
  spentCents: number,
  committedCents: number,
): number | undefined {
  if (capCents === null || capCents === undefined) return undefined;
  return Math.max(0, spentCents + committedCents - capCents);
}

export type CategoryRollup = {
  category: ExpenseCategory;
  /** undefined → no cap on this category. */
  capCents: number | undefined;
  /** All expenses in the category (base-currency cents). */
  spentCents: number;
  /** Unpaid remainder of selected/booked options in the category. */
  committedCents: number;
  leftCents: number | undefined;
  overCents: number | undefined;
};

/**
 * One stacked-bar row per category that has a cap, spend, or committed cost.
 * Rows come back in enum order so every view agrees.
 */
export function rollupsByCategory(
  caps: CategoryCaps | null | undefined,
  spentCentsByCategory: Record<string, number>,
  committedCentsByCategory: Record<string, number>,
): CategoryRollup[] {
  const active = new Set<string>([
    ...Object.keys(caps ?? {}).filter((c) => caps![c as ExpenseCategory] !== undefined),
    ...Object.keys(spentCentsByCategory).filter((c) => spentCentsByCategory[c] !== 0),
    ...Object.keys(committedCentsByCategory).filter((c) => committedCentsByCategory[c] !== 0),
  ]);
  return EXPENSE_CATEGORIES.filter((c) => active.has(c)).map((c) => {
    const capCents = caps?.[c];
    const spentCents = spentCentsByCategory[c] ?? 0;
    const committedCents = committedCentsByCategory[c] ?? 0;
    return {
      category: c,
      capCents,
      spentCents,
      committedCents,
      leftCents: leftFromCap(capCents, spentCents, committedCents),
      overCents: overFromCap(capCents, spentCents, committedCents),
    };
  });
}

/**
 * Per-person shares of a (non-negative) cent total across n travelers —
 * largest-remainder via weightedSplit, so the shares always sum exactly to
 * the total. Returns [] when there is nobody to split across.
 */
export function perPersonCents(totalCents: number, travelerCount: number): number[] {
  if (travelerCount <= 0) return [];
  if (totalCents <= 0) return Array.from({ length: travelerCount }, () => 0);
  return weightedSplit(totalCents, Array.from({ length: travelerCount }, () => 1));
}

import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { expenses, expenseShares, itineraryItems, journalEntries, optionIsActive, travelers, tripOptions, trips, users } from '@/lib/db/schema';
import {
  categoryForOptionKind,
  EXPENSE_CATEGORIES,
  optionPriceBaseCents,
  rollupsByCategory,
  unpaidCommittedCents,
  type CategoryCaps,
  type CategoryRollup,
  type ExpenseCategory,
} from '@/lib/domain/budget';
import { fxRate } from '@/lib/providers/frankfurter';
import { planSplit, settleUp, toBaseCents, toCents, type Balance, type SplitInput, type SplitRow, type Transfer } from '@/lib/domain/money';
import { money } from '@/lib/ui-format';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent, type Tx } from './events';
import { getTrip } from './trips';

export async function listTravelers(tripId: string) {
  return db.select().from(travelers).where(eq(travelers.tripId, tripId)).orderBy(asc(travelers.createdAt));
}

/**
 * Insert an expense plus its shares inside a caller's transaction. Split out
 * of addExpense so the booked→spent bridge in services/options.ts can create
 * the expense in the same transaction as the status change. The caller
 * resolves FX, plans the split (planSplit), and records the activity event.
 */
export async function insertExpenseRows(
  tx: Tx,
  input: {
    tripId: string; description: string; category: string; amount: number; currency: string;
    rate: number; baseCents: number; spentOn: string; paidByTravelerId: string;
    split: SplitInput; planned: SplitRow[];
    optionId?: string | null; itineraryItemId?: string | null;
    notes?: string | null; createdBy: string;
  },
) {
  const [row] = await tx.insert(expenses).values({
    tripId: input.tripId, description: input.description, category: input.category as never,
    amount: String(input.amount), currency: input.currency,
    fxRate: String(input.rate), amountBase: String(input.baseCents / 100),
    spentOn: input.spentOn, paidByTravelerId: input.paidByTravelerId,
    splitMethod: input.split.method, optionId: input.optionId ?? null,
    itineraryItemId: input.itineraryItemId ?? null,
    notes: input.notes ?? null, createdBy: input.createdBy,
  }).returning();
  if (input.planned.length > 0) {
    await tx.insert(expenseShares).values(
      input.planned.map((r) => ({
        expenseId: row.id, travelerId: r.travelerId, shareBase: String(r.shareBaseCents / 100),
        shares: r.shares !== undefined ? String(r.shares) : null,
        exactAmount: r.exactCents !== undefined ? String(r.exactCents / 100) : null,
      })),
    );
  }
  return row;
}

export async function addExpense(
  user: { id: string; name: string }, tripId: string,
  input: {
    description: string; category: string; amount: number; currency: string;
    spentOn: string; paidByTravelerId: string;
    split?: SplitInput; notes?: string | null;
    optionId?: string | null; itineraryItemId?: string | null;
  },
) {
  await assertTripRole(tripId, user.id, 'editor');
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError();
  const tvl = await listTravelers(tripId);
  const memberIds = new Set(tvl.map((t) => t.id));
  if (!memberIds.has(input.paidByTravelerId)) throw new Error('Payer is not a traveler on this trip');
  const split = input.split ?? { method: 'equal' as const, travelerIds: tvl.map((t) => t.id) };
  const splitIds = split.method === 'equal' ? split.travelerIds : split.parts.map((p) => p.travelerId);
  if (splitIds.some((id) => !memberIds.has(id))) throw new Error('Split includes someone who is not on this trip');
  const rate = input.currency === trip.currency ? 1 : await fxRate(input.currency, trip.currency, input.spentOn);
  const amountCents = toCents(input.amount);
  const baseCents = toBaseCents(input.amount, rate);
  const planned = planSplit(split, amountCents, baseCents, input.currency);
  if ('error' in planned) throw new Error(planned.error);

  return db.transaction(async (tx) => {
    const row = await insertExpenseRows(tx, {
      tripId, description: input.description, category: input.category,
      amount: input.amount, currency: input.currency, rate, baseCents,
      spentOn: input.spentOn, paidByTravelerId: input.paidByTravelerId,
      split, planned: planned.rows,
      optionId: input.optionId, itineraryItemId: input.itineraryItemId,
      notes: input.notes, createdBy: user.id,
    });
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'expense.added',
      summary: `${user.name} logged ${input.description} (${money(input.amount, input.currency, 2)})`,
      entityType: 'expense', entityId: row.id,
    });
    return row;
  });
}

export async function deleteExpense(user: { id: string; name: string }, tripId: string, expenseId: string) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const cur = await tx.select().from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId))).limit(1);
    if (!cur[0]) throw new NotFoundError('Expense not found');
    await tx.delete(expenses).where(eq(expenses.id, expenseId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'expense.removed',
      summary: `${user.name} removed expense ${cur[0].description}`, entityType: 'expense', entityId: expenseId,
    });
  });
}

export async function listExpenses(tripId: string) {
  const rows = await db
    .select({ expense: expenses, payer: travelers.displayName, shareTravelerId: expenseShares.travelerId, shareBase: expenseShares.shareBase, shares: expenseShares.shares, exactAmount: expenseShares.exactAmount })
    .from(expenses)
    .innerJoin(travelers, eq(expenses.paidByTravelerId, travelers.id))
    .leftJoin(expenseShares, eq(expenses.id, expenseShares.expenseId))
    .where(eq(expenses.tripId, tripId))
    .orderBy(desc(expenses.spentOn));
  const byId = new Map<string, { expense: typeof expenses.$inferSelect; payer: string; shares: { travelerId: string; shareBase: string; shares: string | null; exactAmount: string | null }[] }>();
  for (const r of rows) {
    const e = byId.get(r.expense.id) ?? { expense: r.expense, payer: r.payer, shares: [] };
    if (r.shareTravelerId) e.shares.push({ travelerId: r.shareTravelerId, shareBase: r.shareBase!, shares: r.shares, exactAmount: r.exactAmount });
    byId.set(r.expense.id, e);
  }
  return [...byId.values()];
}

export type BudgetSummary = {
  plannedByCategory: Record<string, number>;
  /** Flights/lodging with nothing selected yet: cheapest shortlisted price. */
  estimateByCategory: Record<string, { amount: number; count: number }>;
  actualByCategory: Record<string, number>;
  totalActualCents: number;
  /**
   * Unpaid remainder of selected/booked options per category, in base cents.
   * A booked option whose expense is already logged contributes ~0 here, so
   * booked+paid never double-counts.
   */
  committedCentsByCategory: Record<string, number>;
  totalCommittedCents: number;
  /** Base-currency cents per category (all expenses, linked or not). */
  spentCentsByCategory: Record<string, number>;
  caps: { totalCents: number | null; byCategory: CategoryCaps };
  /** Per-category committed/spent/cap rows for the stacked bars, enum order. */
  rollups: CategoryRollup[];
  balances: (Balance & { name: string })[];
  transfers: (Transfer & { fromName: string; toName: string })[];
  currency: string;
};

/**
 * Read the stored category caps: only enum keys, finite numbers ≥ 0, stored
 * as integer cents. Anything else is ignored so a hand-edited row can't
 * break the budget page.
 */
export function parseCategoryCaps(raw: unknown): CategoryCaps {
  const out: CategoryCaps = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(k)) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    out[k as ExpenseCategory] = Math.round(v);
  }
  return out;
}

export async function budgetSummary(tripId: string, currency: string): Promise<BudgetSummary> {
  const [tripRow, opts, exps, tvl] = await Promise.all([
    db.select({ budgetTotal: trips.budgetTotal, budgetByCategory: trips.budgetByCategory })
      .from(trips).where(eq(trips.id, tripId)).limit(1),
    db.select().from(tripOptions).where(and(eq(tripOptions.tripId, tripId), optionIsActive)),
    listExpenses(tripId),
    listTravelers(tripId),
  ]);
  // Planned = what the group committed to (selected/booked). Shortlisted
  // alternatives are not summed — three candidate flights aren't three flights.
  const plannedByCategory: Record<string, number> = {};
  const estimateByCategory: Record<string, { amount: number; count: number }> = {};
  const actualByCategory: Record<string, number> = {};
  const committedCentsByCategory: Record<string, number> = {};
  const spentCentsByCategory: Record<string, number> = {};
  const linkedCentsByOption = new Map<string, number>();
  const net = new Map<string, number>();
  let total = 0;
  for (const { expense, shares } of exps) {
    const cents = Math.round(Number(expense.amountBase) * 100);
    total += cents;
    actualByCategory[expense.category] = (actualByCategory[expense.category] ?? 0) + cents / 100;
    spentCentsByCategory[expense.category] = (spentCentsByCategory[expense.category] ?? 0) + cents;
    if (expense.optionId) {
      linkedCentsByOption.set(expense.optionId, (linkedCentsByOption.get(expense.optionId) ?? 0) + cents);
    }
    net.set(expense.paidByTravelerId, (net.get(expense.paidByTravelerId) ?? 0) + cents);
    for (const s of shares) {
      net.set(s.travelerId, (net.get(s.travelerId) ?? 0) - Math.round(Number(s.shareBase) * 100));
    }
  }
  // Option prices are stored in the option's own currency but these rollups
  // are base-currency. Fetch the shared Frankfurter rate once per foreign
  // currency; a currency with no rate is excluded below — never fabricated.
  const foreignCurrencies = [
    ...new Set(
      opts
        .filter((o) => o.priceAmount && o.priceCurrency && o.priceCurrency !== currency)
        .map((o) => o.priceCurrency!),
    ),
  ];
  const optionRates = new Map<string, number>();
  await Promise.all(
    foreignCurrencies.map(async (cur) => {
      try {
        optionRates.set(cur, await fxRate(cur, currency));
      } catch {
        // No rate → that currency's options drop out of the base rollups.
      }
    }),
  );
  let totalCommittedCents = 0;
  for (const o of opts) {
    if ((o.status !== 'selected' && o.status !== 'booked') || !o.priceAmount) continue;
    const cat = categoryForOptionKind(o.kind);
    const priceBaseCents = optionPriceBaseCents(
      Number(o.priceAmount), o.priceCurrency, currency, optionRates,
    );
    if (priceBaseCents === null) continue;
    plannedByCategory[cat] = (plannedByCategory[cat] ?? 0) + priceBaseCents / 100;
    // The unpaid remainder compares base cents to base-currency linked
    // expenses — exact once both sides are in the same unit.
    const unpaid = unpaidCommittedCents(priceBaseCents, linkedCentsByOption.get(o.id) ?? 0);
    if (unpaid > 0) committedCentsByCategory[cat] = (committedCentsByCategory[cat] ?? 0) + unpaid;
    totalCommittedCents += unpaid;
  }
  for (const o of opts) {
    const cat = categoryForOptionKind(o.kind);
    if (o.status !== 'shortlisted' || !o.priceAmount || plannedByCategory[cat] !== undefined) continue;
    if (cat !== 'flights' && cat !== 'lodging') continue;
    const priceBaseCents = optionPriceBaseCents(
      Number(o.priceAmount), o.priceCurrency, currency, optionRates,
    );
    if (priceBaseCents === null) continue;
    const amount = priceBaseCents / 100;
    const e = estimateByCategory[cat];
    estimateByCategory[cat] = {
      amount: e ? Math.min(e.amount, amount) : amount,
      count: (e?.count ?? 0) + 1,
    };
  }
  const caps = {
    totalCents: tripRow[0]?.budgetTotal != null ? Math.round(Number(tripRow[0].budgetTotal) * 100) : null,
    byCategory: parseCategoryCaps(tripRow[0]?.budgetByCategory),
  };
  const rollups = rollupsByCategory(caps.byCategory, spentCentsByCategory, committedCentsByCategory);
  const nameOf = new Map(tvl.map((t) => [t.id, t.displayName]));
  const balances = [...net.entries()].map(([travelerId, netCents]) => ({ travelerId, netCents, name: nameOf.get(travelerId) ?? '?' }));
  const transfers = settleUp(balances).map((t) => ({
    ...t, fromName: nameOf.get(t.from) ?? '?', toName: nameOf.get(t.to) ?? '?',
  }));
  return {
    plannedByCategory, estimateByCategory, actualByCategory, totalActualCents: total,
    committedCentsByCategory, totalCommittedCents, spentCentsByCategory,
    caps, rollups, balances, transfers, currency,
  };
}

/**
 * Set/clear the trip's budget caps. `totalCents` null clears the total;
 * `byCategory` is already validated (enum keys, integer cents ≥ 0) and an
 * empty map clears the column.
 */
export async function setTripBudget(
  user: { id: string; name: string },
  tripId: string,
  input: { totalCents: number | null; byCategory: CategoryCaps },
) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const cur = await tx.select({ id: trips.id, currency: trips.currency })
      .from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!cur[0]) throw new NotFoundError('Trip not found');
    const byCategory = Object.fromEntries(
      Object.entries(input.byCategory).filter(([, v]) => v !== undefined),
    ) as CategoryCaps;
    await tx.update(trips).set({
      budgetTotal: input.totalCents === null ? null : (input.totalCents / 100).toFixed(2),
      budgetByCategory: Object.keys(byCategory).length > 0 ? byCategory : null,
      updatedAt: new Date(),
    }).where(eq(trips.id, tripId));
    const capList = Object.entries(byCategory)
      .map(([c, cents]) => `${c} ${money((cents ?? 0) / 100, cur[0].currency, 2)}`)
      .join(', ');
    const parts: string[] = [];
    if (input.totalCents !== null) parts.push(money(input.totalCents / 100, cur[0].currency, 2));
    if (capList) parts.push(`caps: ${capList}`);
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'budget.set',
      summary: parts.length
        ? `${user.name} set the trip budget to ${parts.join(' · ')}`
        : `${user.name} cleared the trip budget`,
      entityType: 'trip', entityId: tripId,
    });
  });
}

// ----- trip log -----

export async function listJournal(tripId: string) {
  return db.select({ j: journalEntries, authorName: users.name })
    .from(journalEntries)
    .innerJoin(users, eq(journalEntries.userId, users.id))
    .where(eq(journalEntries.tripId, tripId))
    .orderBy(asc(journalEntries.day), asc(journalEntries.createdAt));
}

export async function addJournalEntry(user: { id: string; name: string }, tripId: string, day: string | null, body: string) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    await tx.insert(journalEntries).values({ tripId, day, userId: user.id, body });
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'log.entry',
      summary: `${user.name} added a log entry`, entityType: 'journal', entityId: tripId,
    });
  });
}

export async function setItemOutcome(
  user: { id: string; name: string }, tripId: string, itemId: string,
  outcome: 'planned' | 'done' | 'skipped' | 'changed', notes?: string | null, rating?: number | null,
) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const cur = await tx.select().from(itineraryItems)
      .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId))).limit(1);
    if (!cur[0]) throw new NotFoundError('Item not found');
    await tx.update(itineraryItems).set({
      outcome, outcomeNotes: notes ?? cur[0].outcomeNotes,
      rating: rating ?? cur[0].rating, updatedAt: new Date(),
    }).where(eq(itineraryItems.id, itemId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: `log.item_${outcome}`,
      summary: `${user.name} marked ${cur[0].title} as ${outcome}`,
      entityType: 'itinerary_item', entityId: itemId,
    });
  });
}

export async function setTripStatus(user: { id: string; name: string }, tripId: string, status: string) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    await tx.update(trips).set({ status: status as never, updatedAt: new Date() }).where(eq(trips.id, tripId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'trip.status',
      summary: `${user.name} set the trip to ${status}`, entityType: 'trip', entityId: tripId,
    });
  });
}

import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { expenses, expenseShares, itineraryItems, journalEntries, travelers, tripOptions, trips, users } from '@/lib/db/schema';
import { fxRate } from '@/lib/providers/frankfurter';
import { equalSplit, settleUp, toBaseCents, type Balance, type Transfer } from '@/lib/domain/money';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent } from './events';
import { getTrip } from './trips';

export async function listTravelers(tripId: string) {
  return db.select().from(travelers).where(eq(travelers.tripId, tripId)).orderBy(asc(travelers.createdAt));
}

export async function addExpense(
  user: { id: string; name: string }, tripId: string,
  input: {
    description: string; category: string; amount: number; currency: string;
    spentOn: string; paidByTravelerId: string;
    splitTravelerIds?: string[]; notes?: string | null;
    optionId?: string | null; itineraryItemId?: string | null;
  },
) {
  await assertTripRole(tripId, user.id, 'editor');
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError();
  const rate = input.currency === trip.currency ? 1 : await fxRate(input.currency, trip.currency, input.spentOn);
  const baseCents = toBaseCents(input.amount, rate);
  const shares = input.splitTravelerIds?.length ? input.splitTravelerIds : (await listTravelers(tripId)).map((t) => t.id);
  const splits = equalSplit(baseCents, shares.length);

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(expenses).values({
      tripId, description: input.description, category: input.category as never,
      amount: String(input.amount), currency: input.currency,
      fxRate: String(rate), amountBase: String(baseCents / 100),
      spentOn: input.spentOn, paidByTravelerId: input.paidByTravelerId,
      splitMethod: 'equal', optionId: input.optionId ?? null,
      itineraryItemId: input.itineraryItemId ?? null,
      notes: input.notes ?? null, createdBy: user.id,
    }).returning();
    await tx.insert(expenseShares).values(
      shares.map((travelerId, i) => ({ expenseId: row.id, travelerId, shareBase: String(splits[i] / 100) })),
    );
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'expense.added',
      summary: `${user.name} logged ${input.description} (${input.currency} ${input.amount})`,
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
    .select({ expense: expenses, payer: travelers.displayName, shareTravelerId: expenseShares.travelerId, shareBase: expenseShares.shareBase })
    .from(expenses)
    .innerJoin(travelers, eq(expenses.paidByTravelerId, travelers.id))
    .leftJoin(expenseShares, eq(expenses.id, expenseShares.expenseId))
    .where(eq(expenses.tripId, tripId))
    .orderBy(desc(expenses.spentOn));
  const byId = new Map<string, { expense: typeof expenses.$inferSelect; payer: string; shares: { travelerId: string; shareBase: string }[] }>();
  for (const r of rows) {
    const e = byId.get(r.expense.id) ?? { expense: r.expense, payer: r.payer, shares: [] };
    if (r.shareTravelerId) e.shares.push({ travelerId: r.shareTravelerId, shareBase: r.shareBase! });
    byId.set(r.expense.id, e);
  }
  return [...byId.values()];
}

export type BudgetSummary = {
  plannedByCategory: Record<string, number>;
  actualByCategory: Record<string, number>;
  totalActualCents: number;
  balances: (Balance & { name: string })[];
  transfers: (Transfer & { fromName: string; toName: string })[];
  currency: string;
};

export async function budgetSummary(tripId: string, currency: string): Promise<BudgetSummary> {
  const [opts, exps, tvl] = await Promise.all([
    db.select().from(tripOptions).where(eq(tripOptions.tripId, tripId)),
    listExpenses(tripId),
    listTravelers(tripId),
  ]);
  const plannedByCategory: Record<string, number> = {};
  for (const o of opts) {
    if (o.status === 'rejected' || !o.priceAmount) continue;
    const cat = o.kind === 'flight' ? 'flights' : o.kind === 'lodging' ? 'lodging' : o.kind === 'transport' ? 'transport' : 'activities';
    plannedByCategory[cat] = (plannedByCategory[cat] ?? 0) + Number(o.priceAmount);
  }
  const actualByCategory: Record<string, number> = {};
  const net = new Map<string, number>();
  let total = 0;
  for (const { expense, shares } of exps) {
    const cents = Math.round(Number(expense.amountBase) * 100);
    total += cents;
    actualByCategory[expense.category] = (actualByCategory[expense.category] ?? 0) + cents / 100;
    net.set(expense.paidByTravelerId, (net.get(expense.paidByTravelerId) ?? 0) + cents);
    for (const s of shares) {
      net.set(s.travelerId, (net.get(s.travelerId) ?? 0) - Math.round(Number(s.shareBase) * 100));
    }
  }
  const nameOf = new Map(tvl.map((t) => [t.id, t.displayName]));
  const balances = [...net.entries()].map(([travelerId, netCents]) => ({ travelerId, netCents, name: nameOf.get(travelerId) ?? '?' }));
  const transfers = settleUp(balances).map((t) => ({
    ...t, fromName: nameOf.get(t.from) ?? '?', toName: nameOf.get(t.to) ?? '?',
  }));
  return { plannedByCategory, actualByCategory, totalActualCents: total, balances, transfers, currency };
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

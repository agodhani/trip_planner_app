import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  comments,
  optionIsActive,
  optionVotes,
  travelers,
  tripOptions,
  trips,
  users,
} from '@/lib/db/schema';
import { readdOutcome } from '@/lib/domain/option-bin';
import { categoryForOptionKind } from '@/lib/domain/budget';
import { compareDataFor } from '@/lib/domain/compare';
import { planSplit, toBaseCents, toCents, type SplitRow } from '@/lib/domain/money';
import { tripWindowForSelection } from '@/lib/domain/trip-window';
import { fxRate } from '@/lib/providers/frankfurter';
import { todayISO } from '@/lib/clock';
import { money } from '@/lib/ui-format';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent, touchTrip, type Tx } from './events';
import { insertExpenseRows } from './expenses';
import { tripDays } from './itinerary';
import { latestPriceChecks } from './price-watch';

export type OptionStatus = 'shortlisted' | 'selected' | 'booked' | 'rejected';

export async function listOptions(tripId: string, kind?: string) {
  const rows = await db
    .select({ option: tripOptions, author: users.name })
    .from(tripOptions)
    .innerJoin(users, eq(tripOptions.createdBy, users.id))
    .where(
      kind
        ? and(eq(tripOptions.tripId, tripId), eq(tripOptions.kind, kind as never), optionIsActive)
        : and(eq(tripOptions.tripId, tripId), optionIsActive),
    )
    .orderBy(desc(tripOptions.createdAt));
  return rows;
}

type OptionRow = typeof tripOptions.$inferSelect;

/**
 * Un-bin a row inside a transaction. One-pick invariant: if the group moved
 * on while this sat in the bin — another active option of the same kind is
 * already selected/booked — a binned flight/stay comes back 'shortlisted'
 * rather than as a second pick.
 */
async function unremoveOption(tx: Tx, opt: OptionRow): Promise<OptionRow> {
  let status = opt.status;
  if (
    (opt.kind === 'flight' || opt.kind === 'lodging') &&
    (opt.status === 'selected' || opt.status === 'booked')
  ) {
    const clash = await tx
      .select({ id: tripOptions.id })
      .from(tripOptions)
      .where(
        and(
          eq(tripOptions.tripId, opt.tripId),
          eq(tripOptions.kind, opt.kind),
          ne(tripOptions.id, opt.id),
          inArray(tripOptions.status, ['selected', 'booked']),
          optionIsActive,
        ),
      )
      .limit(1);
    if (clash[0]) status = 'shortlisted';
  }
  const [restored] = await tx
    .update(tripOptions)
    .set({ removedAt: null, removedBy: null, status, updatedAt: new Date() })
    .where(eq(tripOptions.id, opt.id))
    .returning();
  return restored;
}

export async function addOption(
  user: { id: string; name: string },
  tripId: string,
  input: {
    kind: 'flight' | 'lodging' | 'activity' | 'transport' | 'other';
    source: string;
    externalId?: string | null;
    title: string;
    subtitle?: string | null;
    data: unknown;
    priceAmount?: number | null;
    priceCurrency?: string | null;
    lat?: number | null;
    lon?: number | null;
    bookingRef?: string | null;
    bookingUrl?: string | null;
  },
) {
  await assertTripRole(tripId, user.id, 'editor');
  return db.transaction(async (tx) => {
    // Idempotent: re-shortlisting the same result (double-click, two members
    // at once) returns the existing row instead of a unique violation.
    const [row] = await tx.insert(tripOptions).values({
      tripId, kind: input.kind, source: input.source,
      externalId: input.externalId ?? null, title: input.title,
      subtitle: input.subtitle ?? null, data: input.data as object,
      priceAmount: input.priceAmount != null ? String(input.priceAmount) : null,
      priceCurrency: input.priceCurrency ?? null,
      lat: input.lat ?? null, lon: input.lon ?? null,
      bookingRef: input.bookingRef ?? null, bookingUrl: input.bookingUrl ?? null,
      createdBy: user.id,
    }).onConflictDoNothing().returning();
    if (!row) {
      // Deliberately unfiltered: a conflict can mean "still shortlisted" or
      // "sitting in the bin" — re-shortlisting a binned result restores it,
      // votes and comments intact.
      const [existing] = await tx.select().from(tripOptions).where(and(
        eq(tripOptions.tripId, tripId), eq(tripOptions.kind, input.kind),
        eq(tripOptions.source, input.source), eq(tripOptions.externalId, input.externalId ?? ''),
      )).limit(1);
      if (existing && readdOutcome(existing) === 'restore') {
        const restored = await unremoveOption(tx, existing);
        await recordEvent(tx, {
          tripId, userId: user.id, verb: 'option.restored',
          summary: `${user.name} restored ${restored.title}`,
          entityType: 'option', entityId: restored.id,
        });
        return restored;
      }
      return existing;
    }
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'option.added',
      summary: `${user.name} shortlisted ${input.title}`,
      entityType: 'option', entityId: row.id,
    });
    return row;
  });
}

export type BookingPayment = {
  /** Actual amount paid; defaults to the option price when omitted. */
  paidAmount?: number | null;
  /** Defaults to the option price currency, then the trip currency. */
  paidCurrency?: string | null;
  /** When true, a linked expense is created in the same transaction. */
  logExpense?: boolean;
};

type ExpensePlan = {
  amount: number;
  currency: string;
  rate: number;
  baseCents: number;
  spentOn: string;
  payerTravelerId: string;
  rows: SplitRow[];
};

/**
 * Plan the booked→spent bridge before the transaction: FX (a provider call)
 * must not run inside the tx. Returns the plan, or a human note explaining
 * why no expense will be logged. The expense records the actual paid amount;
 * any remainder of the option price stays committed via unpaidCommittedCents.
 */
async function planBookingExpense(
  user: { id: string; homeTimezone?: string },
  tripId: string,
  opt: typeof tripOptions.$inferSelect,
  booking: BookingPayment,
  tripCurrency: string,
): Promise<{ plan: ExpensePlan | null; note: string | null }> {
  const amount =
    booking.paidAmount ?? (opt.priceAmount != null ? Number(opt.priceAmount) : 0);
  if (!Number.isFinite(amount) || amount < 0) return { plan: null, note: 'invalid paid amount' };
  if (amount === 0) return { plan: null, note: 'no payment amount to log' };
  const currency = booking.paidCurrency ?? opt.priceCurrency ?? tripCurrency;
  const tvl = await db.select().from(travelers).where(eq(travelers.tripId, tripId)).orderBy(asc(travelers.createdAt));
  const payer = tvl.find((t) => t.userId === user.id);
  if (!payer) {
    return { plan: null, note: 'your account is not linked to a traveler on this trip' };
  }
  const spentOn = todayISO(user.homeTimezone ?? 'UTC');
  const rate = currency === tripCurrency ? 1 : await fxRate(currency, tripCurrency, spentOn);
  const amountCents = toCents(amount);
  const baseCents = toBaseCents(amount, rate);
  const planned = planSplit(
    { method: 'equal', travelerIds: tvl.map((t) => t.id) },
    amountCents, baseCents, currency,
  );
  if ('error' in planned) return { plan: null, note: planned.error };
  return {
    plan: {
      amount, currency, rate, baseCents, spentOn,
      payerTravelerId: payer.id, rows: planned.rows,
    },
    note: null,
  };
}

export async function setOptionStatus(
  user: { id: string; name: string; homeTimezone?: string },
  tripId: string,
  optionId: string,
  status: OptionStatus,
  bookingRef?: string | null,
  booking?: BookingPayment,
) {
  await assertTripRole(tripId, user.id, 'editor');

  // Plan the expense outside the transaction (FX can hit the network). The
  // option is re-read inside the tx — the outside read only feeds defaults.
  let expensePlan: ExpensePlan | null = null;
  let expenseNote: string | null = null;
  if (status === 'booked' && booking?.logExpense) {
    const [opt, tripRow] = await Promise.all([
      db.select().from(tripOptions)
        .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId), optionIsActive)).limit(1),
      db.select({ currency: trips.currency }).from(trips).where(eq(trips.id, tripId)).limit(1),
    ]);
    if (!opt[0]) throw new NotFoundError('Option not found');
    if (!tripRow[0]) throw new NotFoundError('Trip not found');
    const r = await planBookingExpense(user, tripId, opt[0], booking, tripRow[0].currency);
    expensePlan = r.plan;
    expenseNote = r.note;
  }

  await db.transaction(async (tx) => {
    const opt = await tx.select().from(tripOptions)
      .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId), optionIsActive)).limit(1);
    if (!opt[0]) throw new NotFoundError('Option not found');
    // One flight and one stay per trip; activities/transport can stack.
    // Binned rows are frozen — they demote on restore, not here.
    if (status === 'selected' && (opt[0].kind === 'flight' || opt[0].kind === 'lodging')) {
      await tx.update(tripOptions).set({ status: 'shortlisted' })
        .where(and(eq(tripOptions.tripId, tripId), eq(tripOptions.kind, opt[0].kind), eq(tripOptions.status, 'selected'), ne(tripOptions.id, optionId), optionIsActive));
    }
    // Selected flight anchors the trip dates. A one-way option (no return
    // leg) keeps the established window end — explicit dates win, otherwise
    // the strategy-derived window — so the board never drops later days.
    if (status === 'selected' && opt[0].kind === 'flight') {
      const data = opt[0].data as { outbound?: { departLocal?: string }; return?: { arriveLocal?: string } };
      const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).limit(1);
      const range = trip ? tripDays(trip) : null;
      const next = tripWindowForSelection(
        {
          departDay: data.outbound?.departLocal?.slice(0, 10) ?? null,
          returnDay: data.return?.arriveLocal?.slice(0, 10) ?? null,
        },
        {
          start: trip?.startDate ?? range?.start ?? null,
          end: trip?.endDate ?? range?.end ?? null,
        },
      );
      await tx.update(trips).set(next).where(eq(trips.id, tripId));
    }
    await tx.update(tripOptions)
      .set({ status, bookingRef: bookingRef ?? opt[0].bookingRef, updatedAt: new Date() })
      .where(eq(tripOptions.id, optionId));
    let expenseSummary = '';
    if (expensePlan) {
      // The bridge: the paid amount becomes spent immediately, split equally
      // across the travelers, and stays linked so the option's committed
      // remainder can't double-count it.
      await insertExpenseRows(tx, {
        tripId, description: opt[0].title, category: categoryForOptionKind(opt[0].kind),
        amount: expensePlan.amount, currency: expensePlan.currency,
        rate: expensePlan.rate, baseCents: expensePlan.baseCents,
        spentOn: expensePlan.spentOn, paidByTravelerId: expensePlan.payerTravelerId,
        split: { method: 'equal', travelerIds: expensePlan.rows.map((r) => r.travelerId) },
        planned: expensePlan.rows,
        optionId, notes: 'Logged automatically when marked booked',
        createdBy: user.id,
      });
      expenseSummary = ` and logged ${money(expensePlan.amount, expensePlan.currency, 2)}`;
    } else if (expenseNote) {
      expenseSummary = ` (expense not logged: ${expenseNote})`;
    }
    await recordEvent(tx, {
      tripId, userId: user.id, verb: `option.${status}`,
      summary: `${user.name} marked ${opt[0].title} as ${status}${expenseSummary}`,
      entityType: 'option', entityId: optionId,
    });
  });
}

/**
 * Move an option to the bin (soft delete). Votes/comments keep their optionId
 * and come back on restore; itinerary items and expenses keep pointing at the
 * row, which is filtered out of every active read by optionIsActive.
 */
export async function deleteOption(
  user: { id: string; name: string }, tripId: string, optionId: string,
) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const opt = await tx.select().from(tripOptions)
      .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId))).limit(1);
    if (!opt[0]) throw new NotFoundError('Option not found');
    if (opt[0].removedAt) return; // already in the bin — remove is idempotent
    await tx.update(tripOptions)
      .set({ removedAt: new Date(), removedBy: user.id, updatedAt: new Date() })
      .where(eq(tripOptions.id, optionId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'option.removed',
      summary: `${user.name} removed ${opt[0].title}`, entityType: 'option', entityId: optionId,
    });
  });
}

/** Undo a removal: the option comes back with its votes and comments. */
export async function restoreOption(
  user: { id: string; name: string }, tripId: string, optionId: string,
) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const opt = await tx.select().from(tripOptions)
      .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId))).limit(1);
    if (!opt[0]) throw new NotFoundError('Option not found');
    if (!opt[0].removedAt) return; // not in the bin — nothing to restore
    const restored = await unremoveOption(tx, opt[0]);
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'option.restored',
      summary: `${user.name} restored ${restored.title}`, entityType: 'option', entityId: optionId,
    });
  });
}

/**
 * Delete forever — the old hard delete. Only bin members may be purged, and
 * it stays a tx.delete: votes/comments cascade, itinerary/expense links go
 * null but keep their denormalized titles.
 */
export async function purgeOption(
  user: { id: string; name: string }, tripId: string, optionId: string,
) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const opt = await tx.select().from(tripOptions)
      .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId))).limit(1);
    if (!opt[0]) throw new NotFoundError('Option not found');
    if (!opt[0].removedAt) throw new Error('Only a removed option can be deleted forever');
    await tx.delete(tripOptions).where(eq(tripOptions.id, optionId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'option.purged',
      summary: `${user.name} permanently deleted ${opt[0].title}`, entityType: 'option', entityId: optionId,
    });
  });
}

export type RemovedOptionRow = {
  option: OptionRow;
  remover: string | null;
};

/** The bin: removed options newest first, with who removed them. */
export async function listRemovedOptions(tripId: string): Promise<RemovedOptionRow[]> {
  return db
    .select({ option: tripOptions, remover: users.name })
    .from(tripOptions)
    .leftJoin(users, eq(tripOptions.removedBy, users.id))
    .where(and(eq(tripOptions.tripId, tripId), isNotNull(tripOptions.removedAt)))
    .orderBy(desc(tripOptions.removedAt));
}

export async function vote(
  user: { id: string }, tripId: string, optionId: string, value: 1 | -1 | 0,
) {
  await assertTripRole(tripId, user.id, 'viewer'); // viewers may vote
  await db.transaction(async (tx: Tx) => {
    const opt = await tx
      .select({ id: tripOptions.id })
      .from(tripOptions)
      .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId), optionIsActive))
      .limit(1);
    if (!opt[0]) throw new NotFoundError('Option not found');
    if (value === 0) {
      await tx.delete(optionVotes).where(and(eq(optionVotes.optionId, optionId), eq(optionVotes.userId, user.id)));
    } else {
      await tx.insert(optionVotes).values({ optionId, userId: user.id, value })
        .onConflictDoUpdate({ target: [optionVotes.optionId, optionVotes.userId], set: { value } });
    }
    await touchTrip(tx, tripId); // votes bump version only — no feed event
  });
}

export async function listVotes(optionIds: string[]) {
  if (!optionIds.length) return new Map<string, { score: number; voters: { name: string; value: number }[] }>();
  const rows = await db.select({ optionId: optionVotes.optionId, value: optionVotes.value, name: users.name })
    .from(optionVotes).innerJoin(users, eq(optionVotes.userId, users.id))
    .where(inArray(optionVotes.optionId, optionIds));
  const map = new Map<string, { score: number; voters: { name: string; value: number }[] }>();
  for (const r of rows) {
    const e = map.get(r.optionId) ?? { score: 0, voters: [] };
    e.score += r.value; e.voters.push({ name: r.name, value: r.value });
    map.set(r.optionId, e);
  }
  return map;
}

export async function listOptionComments(optionIds: string[]) {
  if (!optionIds.length) return [];
  return db.select({ id: comments.id, optionId: comments.optionId, body: comments.body, createdAt: comments.createdAt, authorName: users.name })
    .from(comments).innerJoin(users, eq(comments.userId, users.id))
    .where(inArray(comments.optionId, optionIds))
    .orderBy(desc(comments.createdAt));
}

export type OptionPanelItem = {
  id: string; title: string; subtitle: string | null; status: string;
  price: number | null; currency: string | null; bookingUrl: string | null;
  bookingRef: string | null; source: string; externalId: string | null;
  kind: string;
  /** Slimmed-down jsonb for the compare sheet (see compareDataFor). */
  data: unknown;
  /** Latest Price Watch row (google_flights options); null when never checked. */
  priceCheck?: {
    checkedAt: string;
    priceCents: number | null;
    currency: string | null;
    available: boolean;
  } | null;
  votes: { score: number; voters: { name: string; value: number }[] };
  comments: { id: string; body: string; author: string }[];
};

/** Options of one kind with votes and comments, shaped for the UI panel. */
export async function optionPanel(tripId: string, kind: string): Promise<OptionPanelItem[]> {
  const rows = (await listOptions(tripId, kind)).map((r) => r.option);
  const ids = rows.map((o) => o.id);
  const [votes, commentRows, checks] = await Promise.all([
    listVotes(ids),
    listOptionComments(ids),
    latestPriceChecks(ids),
  ]);
  return rows.map((o) => {
    const pc = checks.get(o.id);
    return {
      id: o.id, title: o.title, subtitle: o.subtitle, status: o.status,
      price: o.priceAmount ? Number(o.priceAmount) : null, currency: o.priceCurrency,
      bookingUrl: o.bookingUrl, bookingRef: o.bookingRef, source: o.source,
      externalId: o.externalId, kind: o.kind, data: compareDataFor(o.kind, o.data),
      priceCheck: pc
        ? {
            checkedAt: pc.checkedAt.toISOString(),
            priceCents: pc.priceCents,
            currency: pc.currency,
            available: pc.available,
          }
        : null,
      votes: votes.get(o.id) ?? { score: 0, voters: [] },
      comments: commentRows
        .filter((c) => c.optionId === o.id)
        .map((c) => ({ id: c.id, body: c.body, author: c.authorName })),
    };
  });
}

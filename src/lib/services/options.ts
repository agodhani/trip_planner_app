import 'server-only';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { comments, optionVotes, tripOptions, trips, users } from '@/lib/db/schema';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent, touchTrip, type Tx } from './events';

export type OptionStatus = 'shortlisted' | 'selected' | 'booked' | 'rejected';

export async function listOptions(tripId: string, kind?: string) {
  const rows = await db
    .select({ option: tripOptions, author: users.name })
    .from(tripOptions)
    .innerJoin(users, eq(tripOptions.createdBy, users.id))
    .where(kind ? and(eq(tripOptions.tripId, tripId), eq(tripOptions.kind, kind as never)) : eq(tripOptions.tripId, tripId))
    .orderBy(desc(tripOptions.createdAt));
  return rows;
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
      const [existing] = await tx.select().from(tripOptions).where(and(
        eq(tripOptions.tripId, tripId), eq(tripOptions.kind, input.kind),
        eq(tripOptions.source, input.source), eq(tripOptions.externalId, input.externalId ?? ''),
      )).limit(1);
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

export async function setOptionStatus(
  user: { id: string; name: string },
  tripId: string,
  optionId: string,
  status: OptionStatus,
  bookingRef?: string | null,
) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const opt = await tx.select().from(tripOptions)
      .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId))).limit(1);
    if (!opt[0]) throw new NotFoundError('Option not found');
    // One flight and one stay per trip; activities/transport can stack.
    if (status === 'selected' && (opt[0].kind === 'flight' || opt[0].kind === 'lodging')) {
      await tx.update(tripOptions).set({ status: 'shortlisted' })
        .where(and(eq(tripOptions.tripId, tripId), eq(tripOptions.kind, opt[0].kind), eq(tripOptions.status, 'selected'), ne(tripOptions.id, optionId)));
    }
    // Selected flight anchors the trip dates.
    if (status === 'selected' && opt[0].kind === 'flight') {
      const data = opt[0].data as { outbound?: { departLocal: string }; return?: { arriveLocal: string } };
      const start = data.outbound?.departLocal?.slice(0, 10) ?? null;
      const end = (data.return?.arriveLocal ?? data.outbound?.departLocal)?.slice(0, 10) ?? null;
      await tx.update(trips).set({ startDate: start, endDate: end }).where(eq(trips.id, tripId));
    }
    await tx.update(tripOptions)
      .set({ status, bookingRef: bookingRef ?? opt[0].bookingRef, updatedAt: new Date() })
      .where(eq(tripOptions.id, optionId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: `option.${status}`,
      summary: `${user.name} marked ${opt[0].title} as ${status}`,
      entityType: 'option', entityId: optionId,
    });
  });
}

export async function deleteOption(
  user: { id: string; name: string }, tripId: string, optionId: string,
) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const opt = await tx.select().from(tripOptions)
      .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId))).limit(1);
    if (!opt[0]) throw new NotFoundError('Option not found');
    await tx.delete(tripOptions).where(eq(tripOptions.id, optionId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'option.removed',
      summary: `${user.name} removed ${opt[0].title}`, entityType: 'option', entityId: optionId,
    });
  });
}

export async function vote(
  user: { id: string }, tripId: string, optionId: string, value: 1 | -1 | 0,
) {
  await assertTripRole(tripId, user.id, 'viewer'); // viewers may vote
  await db.transaction(async (tx: Tx) => {
    const opt = await tx
      .select({ id: tripOptions.id })
      .from(tripOptions)
      .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId)))
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
  votes: { score: number; voters: { name: string; value: number }[] };
  comments: { id: string; body: string; author: string }[];
};

/** Options of one kind with votes and comments, shaped for the UI panel. */
export async function optionPanel(tripId: string, kind: string): Promise<OptionPanelItem[]> {
  const rows = (await listOptions(tripId, kind)).map((r) => r.option);
  const ids = rows.map((o) => o.id);
  const [votes, commentRows] = await Promise.all([listVotes(ids), listOptionComments(ids)]);
  return rows.map((o) => ({
    id: o.id, title: o.title, subtitle: o.subtitle, status: o.status,
    price: o.priceAmount ? Number(o.priceAmount) : null, currency: o.priceCurrency,
    bookingUrl: o.bookingUrl, bookingRef: o.bookingRef, source: o.source,
    externalId: o.externalId, kind: o.kind,
    votes: votes.get(o.id) ?? { score: 0, voters: [] },
    comments: commentRows
      .filter((c) => c.optionId === o.id)
      .map((c) => ({ id: c.id, body: c.body, author: c.authorName })),
  }));
}

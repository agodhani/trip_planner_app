import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { activityEvents, trips } from '@/lib/db/schema';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function touchTrip(tx: Tx, tripId: string): Promise<void> {
  await tx
    .update(trips)
    .set({ version: sql`${trips.version} + 1`, updatedAt: new Date() })
    .where(eq(trips.id, tripId));
}

export type EventInput = {
  tripId: string;
  userId: string | null;
  verb: string;
  summary: string;
  entityType?: string;
  entityId?: string;
};

/**
 * Record an activity event and bump the trip version. Must be called inside
 * the same transaction as the mutation it describes — no trip mutation may
 * skip it.
 */
export async function recordEvent(tx: Tx, event: EventInput): Promise<void> {
  await tx.insert(activityEvents).values({
    tripId: event.tripId,
    userId: event.userId,
    verb: event.verb,
    summary: event.summary,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
  });
  await touchTrip(tx, event.tripId);
}

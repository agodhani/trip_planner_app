import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { travelers } from '@/lib/db/schema';
import { assertTripRole } from './access';
import { recordEvent } from './events';

export type TravelerInfo = {
  id: string;
  displayName: string;
  userId: string | null;
};

export async function listTravelers(tripId: string): Promise<TravelerInfo[]> {
  const rows = await db
    .select({
      id: travelers.id,
      displayName: travelers.displayName,
      userId: travelers.userId,
    })
    .from(travelers)
    .where(eq(travelers.tripId, tripId));
  return rows;
}

export async function addTraveler(
  actor: { id: string; name: string },
  tripId: string,
  displayName: string,
): Promise<void> {
  await assertTripRole(tripId, actor.id, 'owner');
  await db.transaction(async (tx) => {
    await tx.insert(travelers).values({ tripId, displayName });
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'traveler.added',
      summary: `${actor.name} added traveler ${displayName}`,
      entityType: 'traveler',
    });
  });
}

export async function renameTraveler(
  actor: { id: string; name: string },
  tripId: string,
  travelerId: string,
  displayName: string,
): Promise<void> {
  await assertTripRole(tripId, actor.id, 'owner');
  await db.transaction(async (tx) => {
    await tx
      .update(travelers)
      .set({ displayName })
      .where(
        and(eq(travelers.id, travelerId), eq(travelers.tripId, tripId)),
      );
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'traveler.renamed',
      summary: `${actor.name} renamed a traveler to ${displayName}`,
      entityType: 'traveler',
      entityId: travelerId,
    });
  });
}

import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tripMembers, trips, users } from '@/lib/db/schema';
import type { MemberRole } from '@/lib/db/schema';
import { ForbiddenError } from '@/lib/auth/guards';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent } from './events';

export type MemberInfo = {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  joinedAt: Date;
};

export async function listMembers(tripId: string): Promise<MemberInfo[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: tripMembers.role,
      joinedAt: tripMembers.joinedAt,
    })
    .from(tripMembers)
    .innerJoin(users, eq(tripMembers.userId, users.id))
    .where(eq(tripMembers.tripId, tripId));
  const rank: Record<MemberRole, number> = { owner: 0, editor: 1, viewer: 2 };
  return rows.sort((a, b) => rank[a.role] - rank[b.role]);
}

export async function changeMemberRole(
  actor: { id: string; name: string },
  tripId: string,
  targetUserId: string,
  role: Exclude<MemberRole, 'owner'>,
): Promise<void> {
  await assertTripRole(tripId, actor.id, 'owner');
  await db.transaction(async (tx) => {
    const trip = await tx
      .select({ ownerId: trips.ownerId })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (trip[0]?.ownerId === targetUserId) {
      throw new ForbiddenError('The trip owner’s role cannot be changed.');
    }
    const target = await tx
      .select({ userId: tripMembers.userId })
      .from(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, tripId),
          eq(tripMembers.userId, targetUserId),
        ),
      )
      .limit(1);
    if (target.length === 0) throw new NotFoundError('Member not found');
    await tx
      .update(tripMembers)
      .set({ role })
      .where(
        and(
          eq(tripMembers.tripId, tripId),
          eq(tripMembers.userId, targetUserId),
        ),
      );
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'member.role_changed',
      summary: `${actor.name} changed a member’s role to ${role}`,
      entityType: 'member',
      entityId: targetUserId,
    });
  });
}

export async function removeMember(
  actor: { id: string; name: string },
  tripId: string,
  targetUserId: string,
): Promise<void> {
  await assertTripRole(tripId, actor.id, 'owner');
  await db.transaction(async (tx) => {
    const trip = await tx
      .select({ ownerId: trips.ownerId })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (trip[0]?.ownerId === targetUserId) {
      throw new ForbiddenError('The trip owner cannot be removed.');
    }
    const target = await tx
      .select({ userId: tripMembers.userId })
      .from(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, tripId),
          eq(tripMembers.userId, targetUserId),
        ),
      )
      .limit(1);
    if (target.length === 0) throw new NotFoundError('Member not found');
    await tx
      .delete(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, tripId),
          eq(tripMembers.userId, targetUserId),
        ),
      );
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'member.removed',
      summary: `${actor.name} removed a member`,
      entityType: 'member',
      entityId: targetUserId,
    });
  });
}

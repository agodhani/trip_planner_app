import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tripInvites, tripMembers, travelers, trips, users } from '@/lib/db/schema';
import type { MemberRole } from '@/lib/db/schema';
import { roleAtLeast } from '@/lib/auth/guards';
import { env } from '@/lib/env';
import { assertTripRole } from './access';
import { recordEvent } from './events';

export type InviteRole = Exclude<MemberRole, 'owner'>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type InviteInfo = {
  id: string;
  role: InviteRole;
  expiresAt: Date;
  uses: number;
  createdAt: Date;
};

const MAX_EXPIRY_DAYS = 30;

export async function createInvite(
  actor: { id: string; name: string },
  tripId: string,
  role: InviteRole,
  expiryDays: number,
): Promise<{ invite: InviteInfo; url: string }> {
  await assertTripRole(tripId, actor.id, 'owner');
  const days = Math.min(Math.max(1, Math.round(expiryDays)), MAX_EXPIRY_DAYS);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const invite = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tripInvites)
      .values({
        tripId,
        tokenHash: hashToken(token),
        role,
        createdBy: actor.id,
        expiresAt,
      })
      .returning({
        id: tripInvites.id,
        role: tripInvites.role,
        expiresAt: tripInvites.expiresAt,
        uses: tripInvites.uses,
        createdAt: tripInvites.createdAt,
      });
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'invite.created',
      summary: `${actor.name} created a ${role} invite link`,
      entityType: 'invite',
      entityId: row.id,
    });
    return row;
  });

  return {
    invite: invite as InviteInfo,
    url: `${env.APP_URL}/invite/${token}`,
  };
}

export async function listInvites(tripId: string): Promise<InviteInfo[]> {
  const rows = await db
    .select({
      id: tripInvites.id,
      role: tripInvites.role,
      expiresAt: tripInvites.expiresAt,
      uses: tripInvites.uses,
      createdAt: tripInvites.createdAt,
    })
    .from(tripInvites)
    .where(
      and(
        eq(tripInvites.tripId, tripId),
        isNull(tripInvites.revokedAt),
        gt(tripInvites.expiresAt, new Date()),
      ),
    );
  return rows as InviteInfo[];
}

export async function revokeInvite(
  actor: { id: string; name: string },
  tripId: string,
  inviteId: string,
): Promise<void> {
  await assertTripRole(tripId, actor.id, 'owner');
  await db.transaction(async (tx) => {
    await tx
      .update(tripInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(tripInvites.id, inviteId), eq(tripInvites.tripId, tripId)),
      );
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'invite.revoked',
      summary: `${actor.name} revoked an invite link`,
      entityType: 'invite',
      entityId: inviteId,
    });
  });
}

export type InviteView =
  | { status: 'invalid' }
  | {
      status: 'ok';
      tripId: string;
      tripName: string;
      inviterName: string;
      role: InviteRole;
    };

export async function previewInvite(token: string): Promise<InviteView> {
  const rows = await db
    .select({
      id: tripInvites.id,
      tripId: tripInvites.tripId,
      role: tripInvites.role,
      expiresAt: tripInvites.expiresAt,
      revokedAt: tripInvites.revokedAt,
      tripName: trips.name,
      inviterName: users.name,
    })
    .from(tripInvites)
    .innerJoin(trips, eq(tripInvites.tripId, trips.id))
    .innerJoin(users, eq(tripInvites.createdBy, users.id))
    .where(eq(tripInvites.tokenHash, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt || row.expiresAt <= new Date()) {
    return { status: 'invalid' };
  }
  return {
    status: 'ok',
    tripId: row.tripId,
    tripName: row.tripName,
    inviterName: row.inviterName,
    role: row.role as InviteRole,
  };
}

/**
 * Join a trip via invite. Idempotent and never downgrades an existing role.
 * Returns the trip id.
 */
export async function acceptInvite(
  user: { id: string; name: string },
  token: string,
): Promise<{ tripId: string }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(tripInvites)
      .where(eq(tripInvites.tokenHash, hashToken(token)))
      .limit(1);
    const invite = rows[0];
    if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) {
      throw new Error('This invite link is invalid, revoked, or expired.');
    }

    const existing = await tx
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, invite.tripId),
          eq(tripMembers.userId, user.id),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await tx.insert(tripMembers).values({
        tripId: invite.tripId,
        userId: user.id,
        role: invite.role,
      });
    } else if (!roleAtLeast(existing[0].role, invite.role)) {
      await tx
        .update(tripMembers)
        .set({ role: invite.role })
        .where(
          and(
            eq(tripMembers.tripId, invite.tripId),
            eq(tripMembers.userId, user.id),
          ),
        );
    }

    const existingTraveler = await tx
      .select({ id: travelers.id })
      .from(travelers)
      .where(
        and(
          eq(travelers.tripId, invite.tripId),
          eq(travelers.userId, user.id),
        ),
      )
      .limit(1);
    if (existingTraveler.length === 0) {
      await tx.insert(travelers).values({
        tripId: invite.tripId,
        displayName: user.name,
        userId: user.id,
      });
    }

    await tx
      .update(tripInvites)
      .set({ uses: sql`${tripInvites.uses} + 1` })
      .where(eq(tripInvites.id, invite.id));

    await recordEvent(tx, {
      tripId: invite.tripId,
      userId: user.id,
      verb: 'member.joined',
      summary: `${user.name} joined via an invite link`,
      entityType: 'member',
      entityId: user.id,
    });

    return { tripId: invite.tripId };
  });
}

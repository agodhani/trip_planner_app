import 'server-only';
import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '@/lib/db/client';
import { tripMembers } from '@/lib/db/schema';
import type { MemberRole } from '@/lib/db/schema';
import { getSessionUser, type SessionUser } from './session';

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return getSessionUser();
});

/** Accept only same-origin relative paths for `next` redirect targets. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

export async function requireUser(nextPath = '/trips'): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

const ROLE_RANK: Record<MemberRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

export function roleAtLeast(role: MemberRole, min: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export async function getTripRole(
  tripId: string,
  userId: string,
): Promise<MemberRole | null> {
  const rows = await db
    .select({ role: tripMembers.role })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

/**
 * Resolve the current user and their role on a trip. Non-members get a 404
 * so trip existence isn't leaked; an insufficient role throws a
 * ForbiddenError that the trip error boundary renders.
 */
export async function requireTripRole(
  tripId: string,
  min: MemberRole,
): Promise<{ user: SessionUser; role: MemberRole }> {
  const user = await requireUser(`/trips/${tripId}`);
  const role = await getTripRole(tripId, user.id);
  if (!role) notFound();
  if (!roleAtLeast(role, min)) {
    throw new ForbiddenError(
      `This action requires the ${min} role on this trip.`,
    );
  }
  return { user, role };
}

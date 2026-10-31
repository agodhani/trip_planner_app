import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tripMembers } from '@/lib/db/schema';
import type { MemberRole } from '@/lib/db/schema';
import { ForbiddenError, isUuid, roleAtLeast } from '@/lib/auth/guards';

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Authoritative service-layer permission check: non-member ⇒ NotFoundError
 * (mapped to a 404 by callers), insufficient role ⇒ ForbiddenError.
 */
export async function assertTripRole(
  tripId: string,
  userId: string,
  min: MemberRole,
): Promise<MemberRole> {
  if (!isUuid(tripId)) throw new NotFoundError();
  const rows = await db
    .select({ role: tripMembers.role })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);
  const role = rows[0]?.role;
  if (!role) throw new NotFoundError();
  if (!roleAtLeast(role, min)) {
    throw new ForbiddenError(
      `This action requires the ${min} role on this trip.`,
    );
  }
  return role;
}

import 'server-only';
import { and, asc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  activityEvents,
  tripMembers,
  tripOptions,
  trips,
  users,
} from '@/lib/db/schema';
import type { FeedEvent } from '@/lib/domain/activity-feed';
import { assertTripRole } from './access';

const EVENT_LIMIT = 200;

export type PulseViewer = {
  userId: string;
  name: string;
  lastSeenAt: string | null;
};

export type PulseResult = {
  version: number;
  /** Events with id > sinceEventId, oldest first, joined for tab mapping. */
  events: FeedEvent[];
  viewers: PulseViewer[];
};

/** Highest event id so far — the client's poll cursor on mount. */
export async function latestEventId(tripId: string): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${activityEvents.id})` })
    .from(activityEvents)
    .where(eq(activityEvents.tripId, tripId));
  // postgres.js hands raw aggregates back as strings — coerce for the client.
  return Number(rows[0]?.max ?? 0);
}

/**
 * Bidirectional trip pulse: writes the caller's presence heartbeat (at most
 * once per user per minute via a conditional update — the staleness check is
 * DB-side so app/db clock skew can't churn rows), then reads the version,
 * new events (bigserial ids, no clock issues), and every member's presence.
 */
export async function tripPulse(
  user: { id: string },
  tripId: string,
  sinceEventId: number,
): Promise<PulseResult> {
  await assertTripRole(tripId, user.id, 'viewer');

  const heartbeat = db
    .update(tripMembers)
    .set({ lastSeenAt: sql`now()` })
    .where(
      and(
        eq(tripMembers.tripId, tripId),
        eq(tripMembers.userId, user.id),
        or(
          isNull(tripMembers.lastSeenAt),
          lt(
            tripMembers.lastSeenAt,
            sql`now() - interval '60 seconds'`,
          ),
        ),
      ),
    );

  const eventsQ = db
    .select({
      id: activityEvents.id,
      verb: activityEvents.verb,
      summary: activityEvents.summary,
      actorId: activityEvents.userId,
      actorName: users.name,
      optionKind: tripOptions.kind,
    })
    .from(activityEvents)
    .leftJoin(users, eq(activityEvents.userId, users.id))
    .leftJoin(
      tripOptions,
      and(
        eq(activityEvents.entityType, 'option'),
        eq(activityEvents.entityId, sql`${tripOptions.id}::text`),
      ),
    )
    .where(
      and(
        eq(activityEvents.tripId, tripId),
        gt(activityEvents.id, sinceEventId),
      ),
    )
    .orderBy(asc(activityEvents.id))
    .limit(EVENT_LIMIT);

  const versionQ = db
    .select({ version: trips.version })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);

  const viewersQ = db
    .select({
      userId: tripMembers.userId,
      name: users.name,
      lastSeenAt: tripMembers.lastSeenAt,
    })
    .from(tripMembers)
    .innerJoin(users, eq(tripMembers.userId, users.id))
    .where(eq(tripMembers.tripId, tripId));

  const [, events, version, viewers] = await Promise.all([
    heartbeat,
    eventsQ,
    versionQ,
    viewersQ,
  ]);

  return {
    version: version[0]?.version ?? 0,
    events,
    viewers: viewers.map((v) => ({
      userId: v.userId,
      name: v.name,
      lastSeenAt: v.lastSeenAt?.toISOString() ?? null,
    })),
  };
}

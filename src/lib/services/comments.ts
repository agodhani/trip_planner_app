import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { activityEvents, comments, tripOptions, users } from '@/lib/db/schema';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent } from './events';

export type CommentInfo = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
  authorId: string;
};

export async function listTripComments(tripId: string): Promise<CommentInfo[]> {
  return db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorName: users.name,
      authorId: users.id,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.tripId, tripId), isNull(comments.optionId)))
    .orderBy(desc(comments.createdAt))
    .limit(100);
}

export async function addComment(
  user: { id: string; name: string },
  tripId: string,
  body: string,
  optionId?: string,
): Promise<void> {
  await assertTripRole(tripId, user.id, 'viewer');
  await db.transaction(async (tx) => {
    if (optionId) {
      const opt = await tx
        .select({ id: tripOptions.id })
        .from(tripOptions)
        .where(and(eq(tripOptions.id, optionId), eq(tripOptions.tripId, tripId)))
        .limit(1);
      if (!opt[0]) throw new NotFoundError('Option not found');
    }
    await tx
      .insert(comments)
      .values({ tripId, userId: user.id, body, optionId: optionId ?? null });
    await recordEvent(tx, {
      tripId,
      userId: user.id,
      verb: 'comment.added',
      summary: `${user.name} commented on the trip`,
      entityType: 'comment',
    });
  });
}

export type ActivityInfo = {
  id: number;
  verb: string;
  summary: string;
  createdAt: Date;
  actorName: string | null;
};

export async function listActivity(tripId: string): Promise<ActivityInfo[]> {
  return db
    .select({
      id: activityEvents.id,
      verb: activityEvents.verb,
      summary: activityEvents.summary,
      createdAt: activityEvents.createdAt,
      actorName: users.name,
    })
    .from(activityEvents)
    .leftJoin(users, eq(activityEvents.userId, users.id))
    .where(eq(activityEvents.tripId, tripId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(50);
}

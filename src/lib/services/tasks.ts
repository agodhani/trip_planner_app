import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { travelers, tripTasks, users } from '@/lib/db/schema';
import { ForbiddenError } from '@/lib/auth/guards';
import { canToggleTask } from '@/lib/domain/tasks';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent, type Tx } from './events';

export type TaskInfo = {
  id: string;
  title: string;
  details: string | null;
  assigneeTravelerId: string | null;
  assigneeName: string | null;
  /** travelers.userId of the assignee — drives the member toggle rule. */
  assigneeUserId: string | null;
  dueOn: string | null;
  done: boolean;
  doneAt: Date | null;
  doneByName: string | null;
  sortOrder: number;
};

/** Tasks for a trip in stored order — callers apply domain ordering. */
export async function listTasks(tripId: string): Promise<TaskInfo[]> {
  const rows = await db
    .select({
      id: tripTasks.id,
      title: tripTasks.title,
      details: tripTasks.details,
      assigneeTravelerId: tripTasks.assigneeTravelerId,
      assigneeName: travelers.displayName,
      assigneeUserId: travelers.userId,
      dueOn: tripTasks.dueOn,
      done: tripTasks.done,
      doneAt: tripTasks.doneAt,
      doneByName: users.name,
      sortOrder: tripTasks.sortOrder,
    })
    .from(tripTasks)
    .leftJoin(travelers, eq(tripTasks.assigneeTravelerId, travelers.id))
    .leftJoin(users, eq(tripTasks.doneBy, users.id))
    .where(eq(tripTasks.tripId, tripId))
    .orderBy(asc(tripTasks.sortOrder), asc(tripTasks.createdAt));
  return rows;
}

/** The assignee must be a traveler on this trip (null = unassigned). */
async function assertAssignee(
  tx: Tx,
  tripId: string,
  travelerId: string | null,
): Promise<void> {
  if (!travelerId) return;
  const rows = await tx
    .select({ id: travelers.id })
    .from(travelers)
    .where(and(eq(travelers.id, travelerId), eq(travelers.tripId, tripId)))
    .limit(1);
  if (!rows[0]) throw new NotFoundError('Assignee is not a traveler on this trip');
}

export type TaskInput = {
  title: string;
  details?: string | null;
  assigneeTravelerId?: string | null;
  dueOn?: string | null;
};

export async function addTask(
  actor: { id: string; name: string },
  tripId: string,
  input: TaskInput,
): Promise<void> {
  await assertTripRole(tripId, actor.id, 'editor');
  await db.transaction(async (tx) => {
    await assertAssignee(tx, tripId, input.assigneeTravelerId ?? null);
    const [maxRow] = await tx
      .select({
        maxOrder: sql<number>`coalesce(max(${tripTasks.sortOrder}), -1)`,
      })
      .from(tripTasks)
      .where(eq(tripTasks.tripId, tripId));
    const [row] = await tx
      .insert(tripTasks)
      .values({
        tripId,
        title: input.title,
        details: input.details ?? null,
        assigneeTravelerId: input.assigneeTravelerId ?? null,
        dueOn: input.dueOn ?? null,
        sortOrder: (maxRow?.maxOrder ?? -1) + 1,
      })
      .returning({ id: tripTasks.id });
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'task.added',
      summary: `${actor.name} added task ${input.title}`,
      entityType: 'task',
      entityId: row.id,
    });
  });
}

export async function updateTask(
  actor: { id: string; name: string },
  tripId: string,
  taskId: string,
  patch: TaskInput,
): Promise<void> {
  await assertTripRole(tripId, actor.id, 'editor');
  await db.transaction(async (tx) => {
    const cur = await tx
      .select({ id: tripTasks.id })
      .from(tripTasks)
      .where(and(eq(tripTasks.id, taskId), eq(tripTasks.tripId, tripId)))
      .limit(1);
    if (!cur[0]) throw new NotFoundError('Task not found');
    await assertAssignee(tx, tripId, patch.assigneeTravelerId ?? null);
    await tx
      .update(tripTasks)
      .set({
        title: patch.title,
        details: patch.details ?? null,
        assigneeTravelerId: patch.assigneeTravelerId ?? null,
        dueOn: patch.dueOn ?? null,
        updatedAt: new Date(),
      })
      .where(eq(tripTasks.id, taskId));
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'task.updated',
      summary: `${actor.name} updated task ${patch.title}`,
      entityType: 'task',
      entityId: taskId,
    });
  });
}

/**
 * Toggle done. Editors+ can toggle anything; any member — even a viewer —
 * can toggle a task assigned to the traveler row linked to their account.
 */
export async function toggleTask(
  actor: { id: string; name: string },
  tripId: string,
  taskId: string,
  done: boolean,
): Promise<void> {
  const role = await assertTripRole(tripId, actor.id, 'viewer');
  await db.transaction(async (tx) => {
    const cur = await tx
      .select({ title: tripTasks.title, done: tripTasks.done, assigneeUserId: travelers.userId })
      .from(tripTasks)
      .leftJoin(travelers, eq(tripTasks.assigneeTravelerId, travelers.id))
      .where(and(eq(tripTasks.id, taskId), eq(tripTasks.tripId, tripId)))
      .limit(1);
    if (!cur[0]) throw new NotFoundError('Task not found');
    if (!canToggleTask(role, cur[0].assigneeUserId, actor.id)) {
      throw new ForbiddenError(
        'Only editors can toggle tasks assigned to someone else.',
      );
    }
    if (cur[0].done === done) return; // idempotent — no event for a no-op
    await tx
      .update(tripTasks)
      .set({
        done,
        doneAt: done ? new Date() : null,
        doneBy: done ? actor.id : null,
        updatedAt: new Date(),
      })
      .where(eq(tripTasks.id, taskId));
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: done ? 'task.done' : 'task.reopened',
      summary: `${actor.name} ${done ? 'completed' : 'reopened'} task ${cur[0].title}`,
      entityType: 'task',
      entityId: taskId,
    });
  });
}

export async function deleteTask(
  actor: { id: string; name: string },
  tripId: string,
  taskId: string,
): Promise<void> {
  await assertTripRole(tripId, actor.id, 'editor');
  await db.transaction(async (tx) => {
    const cur = await tx
      .select({ title: tripTasks.title })
      .from(tripTasks)
      .where(and(eq(tripTasks.id, taskId), eq(tripTasks.tripId, tripId)))
      .limit(1);
    if (!cur[0]) throw new NotFoundError('Task not found');
    await tx.delete(tripTasks).where(eq(tripTasks.id, taskId));
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'task.removed',
      summary: `${actor.name} removed task ${cur[0].title}`,
      entityType: 'task',
      entityId: taskId,
    });
  });
}

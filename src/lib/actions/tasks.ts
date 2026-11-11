'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formFields } from '@/lib/form-data';
import { requireTripRole } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import { addTask, deleteTask, toggleTask, updateTask } from '@/lib/services/tasks';
import type { ActionState } from './people';

const taskFields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  details: z.string().trim().max(2000).optional(),
  assigneeTravelerId: z.string().uuid().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
};

function revalidateTrip(tripId: string) {
  // Tasks render on the Overview; badges/nudge ride the trip layout too.
  revalidatePath(`/trips/${tripId}`, 'layout');
}

export async function addTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const { user } = await requireTripRole(tripId, 'editor');
  const p = z.object(taskFields).safeParse(formFields(formData));
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Invalid input' };
  try {
    await addTask(user, tripId, {
      title: p.data.title,
      details: p.data.details || null,
      assigneeTravelerId: p.data.assigneeTravelerId ?? null,
      dueOn: p.data.dueOn ?? null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not add the task' };
  }
  revalidateTrip(tripId);
  return {};
}

export async function updateTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const taskId = z.string().uuid().parse(formData.get('taskId'));
  const { user } = await requireTripRole(tripId, 'editor');
  const p = z.object(taskFields).safeParse(formFields(formData));
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Invalid input' };
  try {
    await updateTask(user, tripId, taskId, {
      title: p.data.title,
      details: p.data.details || null,
      assigneeTravelerId: p.data.assigneeTravelerId ?? null,
      dueOn: p.data.dueOn ?? null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the task' };
  }
  revalidateTrip(tripId);
  return {};
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const taskId = z.string().uuid().parse(formData.get('taskId'));
  const done = formData.get('done') === '1';
  // Membership check is 'viewer' — the service applies the finer rule:
  // editors toggle anything, other members only tasks assigned to their
  // own traveler row.
  const { user } = await requireTripRole(tripId, 'viewer');
  try {
    await toggleTask(user, tripId, taskId, done);
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  revalidateTrip(tripId);
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const taskId = z.string().uuid().parse(formData.get('taskId'));
  const { user } = await requireTripRole(tripId, 'editor');
  try {
    await deleteTask(user, tripId, taskId);
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  revalidateTrip(tripId);
}

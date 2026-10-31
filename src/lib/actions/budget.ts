'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTripRole } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import {
  addExpense, addJournalEntry, deleteExpense, setItemOutcome, setTripStatus,
} from '@/lib/services/expenses';
import type { ActionState } from './people';

export async function addExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const { user } = await requireTripRole(tripId, 'editor');
  const schema = z.object({
    description: z.string().min(1).max(200),
    category: z.enum(['flights', 'lodging', 'food', 'activities', 'transport', 'shopping', 'fees', 'other']),
    amount: z.coerce.number().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    paidByTravelerId: z.string().uuid(),
    notes: z.string().max(500).optional(),
  });
  const p = schema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Invalid input' };
  try {
    await addExpense(user, tripId, { ...p.data, notes: p.data.notes || null });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not add expense' };
  }
  revalidatePath(`/trips/${tripId}/budget`);
  return {};
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const expenseId = z.string().uuid().parse(formData.get('expenseId'));
  const { user } = await requireTripRole(tripId, 'editor');
  try {
    await deleteExpense(user, tripId, expenseId);
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  revalidatePath(`/trips/${tripId}/budget`);
}

export async function itemOutcomeAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const itemId = z.string().uuid().parse(formData.get('itemId'));
  const outcome = z.enum(['planned', 'done', 'skipped', 'changed']).parse(formData.get('outcome'));
  const rating = formData.get('rating') ? Number(formData.get('rating')) : null;
  const { user } = await requireTripRole(tripId, 'editor');
  await setItemOutcome(user, tripId, itemId, outcome, String(formData.get('notes') || '') || null, rating);
  revalidatePath(`/trips/${tripId}/log`);
}

export async function journalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Entry cannot be empty' };
  const day = String(formData.get('day') || '') || null;
  const { user } = await requireTripRole(tripId, 'editor');
  await addJournalEntry(user, tripId, day, body);
  revalidatePath(`/trips/${tripId}/log`);
  return {};
}

export async function tripStatusAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const status = z.enum(['planning', 'booked', 'in_progress', 'completed', 'cancelled']).parse(formData.get('status'));
  const { user } = await requireTripRole(tripId, 'editor');
  await setTripStatus(user, tripId, status);
  revalidatePath(`/trips/${tripId}/log`);
  revalidatePath(`/trips/${tripId}`);
}

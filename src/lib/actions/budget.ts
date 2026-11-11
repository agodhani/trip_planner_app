'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formFields } from '@/lib/form-data';
import { requireTripRole } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import {
  addExpense, addJournalEntry, deleteExpense, setItemOutcome, setTripStatus,
} from '@/lib/services/expenses';
import type { SplitInput } from '@/lib/domain/money';
import type { ActionState } from './people';

const uuid = z.string().uuid();

function parseSplit(formData: FormData): SplitInput | undefined | { error: string } {
  const method = String(formData.get('splitMethod') ?? '');
  if (method === '') return undefined;
  if (method === 'equal') {
    const ids = formData.getAll('splitWith').map(String);
    if (!ids.every((id) => uuid.safeParse(id).success)) return { error: 'Invalid split' };
    return { method: 'equal', travelerIds: ids };
  }
  if (method === 'exact') {
    const parts: { travelerId: string; cents: number }[] = [];
    for (const [k, v] of formData.entries()) {
      if (!k.startsWith('exact:')) continue;
      const travelerId = k.slice(6);
      if (!uuid.safeParse(travelerId).success) return { error: 'Invalid split' };
      const n = Number(String(v).trim() === '' ? 0 : v);
      if (!Number.isFinite(n)) return { error: 'Enter valid amounts' };
      parts.push({ travelerId, cents: Math.round(n * 100) });
    }
    return { method: 'exact', parts };
  }
  if (method === 'shares') {
    const parts: { travelerId: string; shares: number }[] = [];
    for (const [k, v] of formData.entries()) {
      if (!k.startsWith('shares:')) continue;
      const travelerId = k.slice(7);
      if (!uuid.safeParse(travelerId).success) return { error: 'Invalid split' };
      const n = Number(String(v).trim() === '' ? 0 : v);
      parts.push({ travelerId, shares: n });
    }
    return { method: 'shares', parts };
  }
  return { error: 'Invalid split' };
}

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
  const p = schema.safeParse(formFields(formData));
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Invalid input' };
  const split = parseSplit(formData);
  if (split && 'error' in split) return { error: split.error };
  try {
    await addExpense(user, tripId, { ...p.data, notes: p.data.notes || null, split });
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
  revalidatePath(`/trips/${tripId}/today`); // the Today screen shows outcomes
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
  revalidatePath(`/trips/${tripId}`, 'layout'); // header status chip + trips list
}

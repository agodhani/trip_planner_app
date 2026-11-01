'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formFields } from '@/lib/form-data';
import { requireTripRole } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import {
  addItem, autoArrange, deleteItem, moveItem, syncAnchors, updateItem,
} from '@/lib/services/itinerary';
import { addManualLeg, chooseLeg, computeLegs } from '@/lib/services/transport';
import type { ActionState } from './people';

const tid = (fd: FormData) => z.string().uuid().parse(fd.get('tripId'));
const ok = (id: string, section = 'itinerary') => revalidatePath(`/trips/${id}/${section}`);

export async function syncAnchorsAction(formData: FormData): Promise<void> {
  const tripId = tid(formData);
  const { user } = await requireTripRole(tripId, 'editor');
  await syncAnchors(user, tripId);
  ok(tripId);
}

const itemSchema = z.object({
  kind: z.enum(['activity', 'meal', 'transport', 'custom']),
  title: z.string().min(1).max(200),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  optionId: z.string().uuid().optional().or(z.literal('')),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  notes: z.string().max(1000).optional(),
  plannedCost: z.coerce.number().nonnegative().optional(),
});

export async function addItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const { user } = await requireTripRole(tripId, 'editor');
  const p = itemSchema.safeParse(formFields(formData));
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Invalid input' };
  const d = p.data;
  await addItem(user, tripId, {
    kind: d.kind, title: d.title,
    day: d.day || null, optionId: d.optionId || null,
    lat: d.lat ?? null, lon: d.lon ?? null, notes: d.notes || null,
    plannedCost: d.plannedCost ?? null,
  });
  ok(tripId);
  return {};
}

export async function moveItemAction(formData: FormData): Promise<void> {
  const tripId = tid(formData);
  const itemId = z.string().uuid().parse(formData.get('itemId'));
  const day = formData.get('day');
  const sortOrder = formData.get('sortOrder');
  const { user } = await requireTripRole(tripId, 'editor');
  await moveItem(user, tripId, itemId, {
    day: day === 'pool' || day === null || day === '' ? null : String(day),
    sortOrder: sortOrder ? Number(sortOrder) : undefined,
  });
  ok(tripId);
}

export async function updateItemAction(formData: FormData): Promise<void> {
  const tripId = tid(formData);
  const itemId = z.string().uuid().parse(formData.get('itemId'));
  const { user } = await requireTripRole(tripId, 'editor');
  const patch: Parameters<typeof updateItem>[3] = {};
  for (const k of ['title', 'startTime', 'endTime', 'notes'] as const) {
    if (formData.has(k)) patch[k] = String(formData.get(k)) || null as never;
  }
  if (formData.has('locked')) patch.locked = formData.get('locked') === '1';
  if (formData.has('plannedCost')) {
    const raw = String(formData.get('plannedCost') ?? '').trim();
    const v = raw === '' ? NaN : Number(raw);
    patch.plannedCost = Number.isFinite(v) ? v : null;
    patch.plannedCurrency = String(formData.get('plannedCurrency') || 'USD');
  }
  await updateItem(user, tripId, itemId, patch);
  ok(tripId);
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const tripId = tid(formData);
  const itemId = z.string().uuid().parse(formData.get('itemId'));
  const { user } = await requireTripRole(tripId, 'editor');
  try {
    await deleteItem(user, tripId, itemId);
  } catch (err) {
    if (err instanceof NotFoundError) return;
    throw err;
  }
  ok(tripId);
}

export async function autoArrangeAction(formData: FormData): Promise<void> {
  const tripId = tid(formData);
  const { user } = await requireTripRole(tripId, 'editor');
  await autoArrange(user, tripId);
  ok(tripId);
}

export async function computeLegsAction(formData: FormData): Promise<void> {
  const tripId = tid(formData);
  const { user } = await requireTripRole(tripId, 'editor');
  await computeLegs(user, tripId);
  revalidatePath(`/trips/${tripId}/transport`);
  ok(tripId);
}

export async function chooseLegAction(formData: FormData): Promise<void> {
  const tripId = tid(formData);
  const legId = z.string().uuid().parse(formData.get('legId'));
  const { user } = await requireTripRole(tripId, 'editor');
  await chooseLeg(user, tripId, legId);
  revalidatePath(`/trips/${tripId}/transport`);
  ok(tripId);
}

export async function manualLegAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const { user } = await requireTripRole(tripId, 'editor');
  const schema = z.object({
    fromItemId: z.string().uuid(), toItemId: z.string().uuid(),
    mode: z.enum(['walk', 'transit', 'drive', 'bike', 'other']),
    summary: z.string().min(1).max(300),
    durationMin: z.coerce.number().positive().optional(),
    cost: z.coerce.number().nonnegative().optional(),
  });
  const p = schema.safeParse(formFields(formData));
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Invalid input' };
  await addManualLeg(user, tripId, {
    ...p.data, currency: String(formData.get('currency') || 'USD'),
  });
  revalidatePath(`/trips/${tripId}/transport`);
  ok(tripId);
  return {};
}

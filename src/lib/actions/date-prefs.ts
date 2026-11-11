'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formFields } from '@/lib/form-data';
import { requireTripRole } from '@/lib/auth/guards';
import { setPairPref } from '@/lib/services/date-prefs';

const prefSchema = z.object({
  tripId: z.string().uuid(),
  depart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // A blank 'back' means a one-way pair.
  back: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  value: z.enum(['works', 'maybe', 'no']),
});

/**
 * Mark the current member's availability on a candidate date pair. Any
 * member may respond (viewer+), matching vote/comment permissions.
 */
export async function setPairPrefAction(formData: FormData): Promise<void> {
  const p = prefSchema.parse(formFields(formData));
  const { user } = await requireTripRole(p.tripId, 'viewer');
  await setPairPref(
    user,
    p.tripId,
    { depart: p.depart, back: p.back ?? null },
    p.value,
  );
  revalidatePath(`/trips/${p.tripId}/flights`);
}

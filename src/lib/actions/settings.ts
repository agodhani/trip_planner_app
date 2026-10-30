'use server';

import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

export type SettingsState = { error?: string; saved?: boolean };

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  homeTimezone: z
    .string()
    .trim()
    .max(100)
    .refine((tz) => DateTime.now().setZone(tz).isValid, {
      message: 'Pick a valid IANA timezone',
    }),
  defaultCurrency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'Currency must be a 3-letter code')
    .transform((s) => s.toUpperCase()),
});

export async function updateProfileAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser('/settings');
  const parsed = schema.safeParse({
    name: formData.get('name'),
    homeTimezone: formData.get('homeTimezone'),
    defaultCurrency: formData.get('defaultCurrency'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  await db
    .update(users)
    .set({
      name: parsed.data.name,
      homeTimezone: parsed.data.homeTimezone,
      defaultCurrency: parsed.data.defaultCurrency,
    })
    .where(eq(users.id, user.id));
  revalidatePath('/settings');
  return { saved: true };
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTripRole } from '@/lib/auth/guards';
import { createShareLink, revokeShareLink } from '@/lib/services/share';

export type ShareActionState = { error?: string; shareUrl?: string };

export async function createShareLinkAction(
  _prev: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  if (!z.string().uuid().safeParse(tripId).success) {
    return { error: 'Invalid trip' };
  }
  const { user } = await requireTripRole(tripId, 'owner');
  const { url } = await createShareLink(user, tripId);
  revalidatePath(`/trips/${tripId}/people`);
  return { shareUrl: url };
}

export async function revokeShareLinkAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const linkId = z.string().uuid().parse(formData.get('linkId'));
  const { user } = await requireTripRole(tripId, 'owner');
  await revokeShareLink(user, tripId, linkId);
  revalidatePath(`/trips/${tripId}/people`);
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTripRole, requireUser } from '@/lib/auth/guards';
import { addComment } from '@/lib/services/comments';
import { acceptInvite, createInvite, revokeInvite } from '@/lib/services/invites';
import { changeMemberRole, removeMember } from '@/lib/services/members';
import { addTraveler, renameTraveler } from '@/lib/services/travelers';

export type ActionState = { error?: string; inviteUrl?: string };

export async function createInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const role = String(formData.get('role') ?? 'editor');
  const expiryDays = Number(formData.get('expiryDays') ?? 7);
  if (role !== 'editor' && role !== 'viewer') {
    return { error: 'Invalid role' };
  }
  const { user } = await requireTripRole(tripId, 'owner');
  const { url } = await createInvite(user, tripId, role, expiryDays);
  revalidatePath(`/trips/${tripId}/people`);
  return { inviteUrl: url };
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const inviteId = z.string().uuid().parse(formData.get('inviteId'));
  const { user } = await requireTripRole(tripId, 'owner');
  await revokeInvite(user, tripId, inviteId);
  revalidatePath(`/trips/${tripId}/people`);
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const userId = z.string().uuid().parse(formData.get('userId'));
  const role = z.enum(['editor', 'viewer']).parse(formData.get('role'));
  const { user } = await requireTripRole(tripId, 'owner');
  await changeMemberRole(user, tripId, userId, role);
  revalidatePath(`/trips/${tripId}/people`);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const userId = z.string().uuid().parse(formData.get('userId'));
  const { user } = await requireTripRole(tripId, 'owner');
  await removeMember(user, tripId, userId);
  revalidatePath(`/trips/${tripId}/people`);
}

export async function addTravelerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const name = String(formData.get('displayName') ?? '').trim();
  if (!name) return { error: 'Name is required' };
  if (name.length > 120) return { error: 'Name is too long' };
  const { user } = await requireTripRole(tripId, 'owner');
  await addTraveler(user, tripId, name);
  revalidatePath(`/trips/${tripId}/people`);
  return {};
}

export async function renameTravelerAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const travelerId = z.string().uuid().parse(formData.get('travelerId'));
  const name = z.string().trim().min(1).max(120).parse(formData.get('displayName'));
  const { user } = await requireTripRole(tripId, 'owner');
  await renameTraveler(user, tripId, travelerId, name);
  revalidatePath(`/trips/${tripId}/people`);
}

export async function addCommentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Comment cannot be empty' };
  if (body.length > 4000) return { error: 'Comment is too long (max 4000)' };
  const { user } = await requireTripRole(tripId, 'viewer');
  await addComment(user, tripId, body);
  revalidatePath(`/trips/${tripId}`);
  return {};
}

export async function joinTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get('token') ?? '');
  const user = await requireUser(`/invite/${token}`);
  let tripId: string;
  try {
    ({ tripId } = await acceptInvite(user, token));
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not join' };
  }
  redirect(`/trips/${tripId}`);
}

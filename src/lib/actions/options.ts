'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formFields } from '@/lib/form-data';
import { requireTripRole } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import { addOption, deleteOption, setOptionStatus, vote, type BookingPayment } from '@/lib/services/options';
import { addComment } from '@/lib/services/comments';
import type { ActionState } from './people';

const sectionEnum = z.enum([
  'flights', 'stay', 'activities', 'transport', 'itinerary', 'budget', 'log',
  'shortlist',
]);
type Section = z.infer<typeof sectionEnum>;

// Options feed the tab badges, overview progress, budget, and itinerary pool,
// so refresh the whole trip layout rather than just the originating tab.
function revalidate(tripId: string, section: Section) {
  void section;
  revalidatePath(`/trips/${tripId}`, 'layout');
}

const shortlistSchema = z.object({
  kind: z.enum(['flight', 'lodging', 'activity', 'transport', 'other']),
  source: z.string().min(1).max(60),
  externalId: z.string().max(300).optional(),
  title: z.string().min(1).max(300),
  subtitle: z.string().max(500).optional(),
  data: z.string().min(2).max(200_000), // serialized normalized result
  priceAmount: z.coerce.number().nonnegative().optional(),
  priceCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  bookingRef: z.string().max(60).optional(),
  bookingUrl: z.string().url().max(2000).optional(),
});

export async function shortlistOptionAction(formData: FormData): Promise<ActionState> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const section = sectionEnum.parse(formData.get('section'));
  const { user } = await requireTripRole(tripId, 'editor');
  const parsed = shortlistSchema.safeParse(formFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const p = parsed.data;
  let data: unknown;
  try {
    data = JSON.parse(p.data);
  } catch {
    return { error: 'Invalid option payload' };
  }
  await addOption(user, tripId, {
    kind: p.kind, source: p.source, externalId: p.externalId ?? null,
    title: p.title, subtitle: p.subtitle ?? null, data,
    priceAmount: p.priceAmount ?? null, priceCurrency: p.priceCurrency ?? null,
    lat: p.lat ?? null, lon: p.lon ?? null,
    bookingRef: p.bookingRef ?? null, bookingUrl: p.bookingUrl ?? null,
  });
  revalidate(tripId, section);
  return {};
}

const bookingSchema = z.object({
  paidAmount: z.coerce.number().nonnegative().optional(),
  paidCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  logExpense: z.literal('on').optional(),
});

export async function optionStatusAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const section = sectionEnum.parse(formData.get('section'));
  const optionId = z.string().uuid().parse(formData.get('optionId'));
  const status = z.enum(['shortlisted', 'selected', 'booked', 'rejected']).parse(formData.get('status'));
  const bookingRef = (formData.get('bookingRef') as string) || null;
  const { user } = await requireTripRole(tripId, 'editor');
  // The booked→spent bridge fields ride along on the mark-booked form only.
  // Blank inputs are absent (formFields), so defaults resolve from the
  // option price server-side. An unchecked box submits nothing → no expense.
  let booking: BookingPayment | undefined;
  if (status === 'booked') {
    const fields = formFields(formData);
    if (typeof fields.paidCurrency === 'string') {
      fields.paidCurrency = fields.paidCurrency.trim().toUpperCase();
    }
    const parsed = bookingSchema.safeParse(fields);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid payment input');
    const p = parsed.data;
    booking = {
      paidAmount: p.paidAmount ?? null,
      paidCurrency: p.paidCurrency ?? null,
      logExpense: p.logExpense === 'on',
    };
  }
  await setOptionStatus(user, tripId, optionId, status, bookingRef, booking);
  revalidate(tripId, section);
}

export async function deleteOptionAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const section = sectionEnum.parse(formData.get('section'));
  const optionId = z.string().uuid().parse(formData.get('optionId'));
  const { user } = await requireTripRole(tripId, 'editor');
  try {
    await deleteOption(user, tripId, optionId);
  } catch (err) {
    if (err instanceof NotFoundError) return;
    throw err;
  }
  revalidate(tripId, section);
}

export async function voteAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const section = sectionEnum.parse(formData.get('section'));
  const optionId = z.string().uuid().parse(formData.get('optionId'));
  const value = z.union([z.literal(-1), z.literal(0), z.literal(1)]).parse(Number(formData.get('value')));
  const { user } = await requireTripRole(tripId, 'viewer');
  await vote(user, tripId, optionId, value);
  revalidate(tripId, section);
}

export async function optionCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const section = sectionEnum.parse(formData.get('section'));
  const optionId = z.string().uuid().parse(formData.get('optionId'));
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Comment cannot be empty' };
  if (body.length > 4000) return { error: 'Comment is too long' };
  const { user } = await requireTripRole(tripId, 'viewer');
  await addComment(user, tripId, body, optionId);
  revalidate(tripId, section);
  return {};
}

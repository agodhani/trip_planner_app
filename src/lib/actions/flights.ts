'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTripRole } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import { startScan } from '@/lib/services/flights';
import { addOption, deleteOption, setOptionStatus, vote } from '@/lib/services/options';
import { addComment } from '@/lib/services/comments';
import type { ActionState } from './people';

export async function startScanAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const adultsOnly = formData.get('adultsOnly') === '1';
  const { user } = await requireTripRole(tripId, 'editor');
  await startScan(user, tripId, adultsOnly);
  revalidatePath(`/trips/${tripId}/flights`);
}

export async function shortlistFlightAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const { user } = await requireTripRole(tripId, 'editor');
  const itinerary = JSON.parse(String(formData.get('itinerary')));
  const dep = itinerary.outbound.departLocal.slice(0, 10);
  const ret = itinerary.return?.departLocal?.slice(0, 10);
  const title = `${itinerary.outbound.from.code}→${itinerary.outbound.to.code} ${itinerary.outbound.airlines.join('/')} ${dep}${ret ? ` → ${ret}` : ''}`;
  await addOption(user, tripId, {
    kind: 'flight', source: 'google_flights',
    externalId: `${itinerary.id}:${dep}:${ret ?? ''}`,
    title,
    subtitle: itinerary.outbound.segments.map((s: { airlineCode: string; flightNumber: string }) => `${s.airlineCode} ${s.flightNumber}`).join(', '),
    data: itinerary,
    priceAmount: itinerary.price.total, priceCurrency: itinerary.price.currency,
    bookingUrl: itinerary.bookingUrl,
  });
  revalidatePath(`/trips/${tripId}/flights`);
}

export async function optionStatusAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const optionId = z.string().uuid().parse(formData.get('optionId'));
  const status = z.enum(['shortlisted', 'selected', 'booked', 'rejected']).parse(formData.get('status'));
  const bookingRef = (formData.get('bookingRef') as string) || null;
  const { user } = await requireTripRole(tripId, 'editor');
  await setOptionStatus(user, tripId, optionId, status, bookingRef);
  revalidatePath(`/trips/${tripId}/flights`);
}

export async function deleteOptionAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const optionId = z.string().uuid().parse(formData.get('optionId'));
  const { user } = await requireTripRole(tripId, 'editor');
  try {
    await deleteOption(user, tripId, optionId);
  } catch (err) {
    if (err instanceof NotFoundError) return;
    throw err;
  }
  revalidatePath(`/trips/${tripId}/flights`);
}

export async function voteAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const optionId = z.string().uuid().parse(formData.get('optionId'));
  const value = z.union([z.literal(-1), z.literal(0), z.literal(1)]).parse(Number(formData.get('value')));
  const { user } = await requireTripRole(tripId, 'viewer');
  await vote(user, tripId, optionId, value);
  revalidatePath(`/trips/${tripId}/flights`);
}

export async function optionCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const optionId = z.string().uuid().parse(formData.get('optionId'));
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Comment cannot be empty' };
  if (body.length > 4000) return { error: 'Comment is too long' };
  const { user } = await requireTripRole(tripId, 'viewer');
  await addComment(user, tripId, body, optionId);
  revalidatePath(`/trips/${tripId}/flights`);
  return {};
}

export async function manualFlightAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const { user } = await requireTripRole(tripId, 'editor');
  const schema = z.object({
    airlineCode: z.string().min(2).max(3), airlineName: z.string().max(80).optional(),
    flightNumber: z.string().min(1).max(8),
    from: z.string().length(3), to: z.string().length(3),
    departLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    arriveLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    returnDepartLocal: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
    returnArriveLocal: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
    price: z.coerce.number().positive().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    bookingRef: z.string().max(40).optional(),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const p = parsed.data;
  const { getAirport } = await import('@/lib/providers/airports');
  const fromAirport = await getAirport(p.from);
  const toAirport = await getAirport(p.to);
  if (!fromAirport) return { error: `Unknown airport ${p.from}` };
  if (!toAirport) return { error: `Unknown airport ${p.to}` };
  const fromTz = fromAirport.tz;
  const toTz = toAirport.tz;
  if (p.arriveLocal <= p.departLocal) {
    return { error: 'Arrival must be after departure (enter the next day if overnight)' };
  }
  const hasReturn = !!(p.returnDepartLocal && p.returnArriveLocal);
  if ((p.returnDepartLocal || p.returnArriveLocal) && !hasReturn) {
    return { error: 'Fill in both return times or neither' };
  }
  if (hasReturn && p.returnArriveLocal! <= p.returnDepartLocal!) {
    return { error: 'Return arrival must be after return departure' };
  }
  const minutes = (a: string, b: string) =>
    Math.max(0, Math.round((Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 60000));
  const seg = {
    airlineCode: p.airlineCode.toUpperCase(), airlineName: p.airlineName || p.airlineCode.toUpperCase(),
    flightNumber: p.flightNumber, from: { code: p.from.toUpperCase() }, to: { code: p.to.toUpperCase() },
    departLocal: p.departLocal, arriveLocal: p.arriveLocal, durationMin: minutes(p.departLocal, p.arriveLocal),
  };
  const returnLeg = hasReturn
    ? {
        segments: [{ ...seg, from: seg.to, to: seg.from, departLocal: p.returnDepartLocal!, arriveLocal: p.returnArriveLocal!, durationMin: minutes(p.returnDepartLocal!, p.returnArriveLocal!) }],
        layovers: [] as { airportCode: string; airportName?: string; durationMin: number; overnight?: boolean }[],
        from: seg.to, to: seg.from,
        departLocal: p.returnDepartLocal!, arriveLocal: p.returnArriveLocal!,
        fromTz: toTz, toTz: fromTz,
        durationMin: minutes(p.returnDepartLocal!, p.returnArriveLocal!), stops: 0, airlines: [seg.airlineCode],
      }
    : undefined;
  const itinerary = {
    id: `manual:${p.airlineCode}${p.flightNumber}:${p.departLocal}${hasReturn ? `:${p.returnDepartLocal}` : ''}`,
    outbound: {
      segments: [seg], layovers: [], from: seg.from, to: seg.to,
      departLocal: p.departLocal, arriveLocal: p.arriveLocal,
      fromTz, toTz, durationMin: seg.durationMin, stops: 0, airlines: [seg.airlineCode],
    },
    return: returnLeg,
    price: { total: p.price ?? null, perPerson: null, currency: p.currency, isFrom: false },
    bookingUrl: '', isBest: false, fetchedAt: new Date().toISOString(),
  };
  await addOption(user, tripId, {
    kind: 'flight', source: 'manual', externalId: itinerary.id,
    title: `Manual: ${seg.from.code}→${seg.to.code} ${seg.airlineCode} ${p.flightNumber} ${p.departLocal.slice(0, 10)}${hasReturn ? ` → ${p.returnDepartLocal!.slice(0, 10)}` : ''}`,
    data: itinerary, priceAmount: p.price ?? null, priceCurrency: p.currency,
    bookingRef: p.bookingRef ?? null,
  });
  revalidatePath(`/trips/${tripId}/flights`);
  return {};
}

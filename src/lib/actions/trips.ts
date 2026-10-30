'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { createTrip } from '@/lib/services/trips';

export type TripFormState = { error?: string };

const weekday = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4),
  z.literal(5), z.literal(6), z.literal(7),
]);

const placeSelection = z.object({
  city: z.string().min(1).max(200),
  countryCode: z.string().min(2).max(3),
  airports: z.array(z.string().length(3)).min(1, 'Pick at least one airport'),
  primaryIata: z.string().length(3),
});

const timeWindow = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const dateStrategy = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('exact'),
    departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }),
  z.object({
    kind: z.literal('weekends_in_month'),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    departWeekday: weekday,
    departFlexDays: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    returnWeekday: weekday,
    returnFlexDays: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  }),
  z.object({
    kind: z.literal('around_date'),
    anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    departFlexDays: z.union([
      z.literal(0), z.literal(1), z.literal(2), z.literal(3),
    ]),
    returnWeekday: weekday,
    returnFlexDays: z.union([
      z.literal(0), z.literal(1), z.literal(2), z.literal(3),
    ]),
  }),
  z.object({
    kind: z.literal('range'),
    earliestDepart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    latestReturn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    minNights: z.number().int().min(0).max(60),
    maxNights: z.number().int().min(0).max(60),
  }),
]);

const payloadSchema = z.object({
  name: z.string().max(200).optional(),
  origin: placeSelection,
  destination: placeSelection,
  adults: z.number().int().min(1).max(9),
  childrenAges: z.array(z.number().int().min(0).max(17)).max(8),
  cabin: z.enum(['economy', 'premium_economy', 'business', 'first']),
  maxStops: z.enum(['any', 'nonstop', 'one', 'two']),
  currency: z.string().length(3),
  dateStrategy,
  timePrefs: z.object({
    timezone: z.string().max(60).optional(),
    outboundDepart: timeWindow.optional(),
    returnDepart: timeWindow.optional(),
  }),
});

export async function createTripAction(
  _prev: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  const user = await requireUser('/trips/new');

  let json: unknown;
  try {
    json = JSON.parse(String(formData.get('payload') ?? ''));
  } catch {
    return { error: 'Malformed submission' };
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid trip input' };
  }
  const p = parsed.data;

  const totalTravelers = p.adults + p.childrenAges.length;
  if (totalTravelers > 9) {
    return { error: 'At most 9 travelers total' };
  }
  const lapInfants = p.childrenAges.filter((a) => a < 2).length;
  if (lapInfants > p.adults) {
    return { error: 'Lap infants (under 2) cannot outnumber adults' };
  }
  if (p.dateStrategy.kind === 'range' && p.dateStrategy.minNights > p.dateStrategy.maxNights) {
    return { error: 'Minimum nights cannot exceed maximum nights' };
  }

  const trip = await createTrip(user, {
    name: p.name,
    origin: p.origin,
    destination: p.destination,
    adults: p.adults,
    childrenAges: p.childrenAges,
    cabin: p.cabin,
    maxStops: p.maxStops,
    currency: p.currency.toUpperCase(),
    dateStrategy: p.dateStrategy,
    timePrefs: p.timePrefs,
  });
  redirect(`/trips/${trip.id}`);
}

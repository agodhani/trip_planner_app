'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formFields } from '@/lib/form-data';
import { requireTripRole } from '@/lib/auth/guards';
import { startScan } from '@/lib/services/flights';
import { addOption } from '@/lib/services/options';
import { flightKey } from '@/lib/domain/flight-rows';
import { dateRange, plural } from '@/lib/ui-format';
import type { ActionState } from './people';

export async function startScanAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const adultsOnly = formData.get('adultsOnly') === '1';
  const { user } = await requireTripRole(tripId, 'editor');
  await startScan(user, tripId, adultsOnly);
  revalidatePath(`/trips/${tripId}/flights`);
}

type SegLite = { airlineCode: string; airlineName?: string; flightNumber: string };
type LegLite = { from: { code: string }; to: { code: string }; departLocal: string; stops: number; segments: SegLite[] };

const legSummary = (leg: LegLite) =>
  `${leg.segments.map((s) => `${s.airlineCode} ${s.flightNumber}`).join(', ')} (${leg.stops === 0 ? 'nonstop' : plural(leg.stops, 'stop')})`;

export async function shortlistFlightAction(formData: FormData): Promise<void> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const { user } = await requireTripRole(tripId, 'editor');
  const itinerary = JSON.parse(String(formData.get('itinerary')));
  const out = itinerary.outbound as LegLite;
  const back = itinerary.return as LegLite | undefined;
  const airlines = [...new Set(out.segments.map((s) => s.airlineName || s.airlineCode))].join(', ');
  await addOption(user, tripId, {
    kind: 'flight', source: 'google_flights',
    externalId: flightKey(itinerary),
    title: `${airlines} · ${out.from.code}→${out.to.code} · ${dateRange(out.departLocal.slice(0, 10), back?.departLocal.slice(0, 10))}`,
    subtitle: back ? `Out ${legSummary(out)} · Back ${legSummary(back)}` : legSummary(out),
    data: itinerary,
    priceAmount: itinerary.price.total, priceCurrency: itinerary.price.currency,
    bookingUrl: itinerary.bookingUrl,
  });
  revalidatePath(`/trips/${tripId}`, 'layout');
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
  const parsed = schema.safeParse(formFields(formData));
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
    title: `${seg.airlineCode} ${p.flightNumber} · ${seg.from.code}→${seg.to.code} · ${dateRange(p.departLocal.slice(0, 10), hasReturn ? p.returnDepartLocal!.slice(0, 10) : null)}`,
    subtitle: hasReturn ? 'Round trip · added manually' : 'One way · added manually',
    data: itinerary, priceAmount: p.price ?? null, priceCurrency: p.currency,
    bookingRef: p.bookingRef ?? null,
  });
  revalidatePath(`/trips/${tripId}`, 'layout');
  return {};
}

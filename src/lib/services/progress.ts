import 'server-only';
import { and, count, eq, sum } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { expenses, itineraryItems, optionIsActive, transportLegs, tripOptions } from '@/lib/db/schema';
import { summarizeProgress, type TripProgress } from '@/lib/domain/progress';
import { latestSearch } from './flights';
import { tripDays } from './itinerary';
import type { TripRow } from './trips';

/** Planning progress for the Overview checklist and trip tabs (cheap queries). */
export async function tripProgress(trip: TripRow): Promise<TripProgress> {
  const [opts, items, legs, exp, search] = await Promise.all([
    db.select({ kind: tripOptions.kind, status: tripOptions.status, title: tripOptions.title })
      .from(tripOptions).where(and(eq(tripOptions.tripId, trip.id), optionIsActive)),
    db.select({ day: itineraryItems.day, system: itineraryItems.system, unplanned: itineraryItems.unplanned })
      .from(itineraryItems).where(eq(itineraryItems.tripId, trip.id)),
    db.select({ n: count() }).from(transportLegs)
      .where(and(eq(transportLegs.tripId, trip.id), eq(transportLegs.chosen, true))),
    db.select({ n: count(), total: sum(expenses.amountBase) }).from(expenses)
      .where(eq(expenses.tripId, trip.id)),
    latestSearch(trip.id),
  ]);
  const scheduled = items.filter((i) => i.day && !i.unplanned && !i.system);
  return summarizeProgress({
    options: opts,
    scanned: search?.status === 'done',
    scheduledItems: scheduled.length,
    daysCovered: new Set(scheduled.map((i) => i.day)).size,
    days: tripDays(trip)?.days.length ?? 0,
    chosenLegs: Number(legs[0]?.n ?? 0),
    expenses: Number(exp[0]?.n ?? 0),
    spent: Number(exp[0]?.total ?? 0),
    currency: trip.currency,
  });
}

import 'server-only';
import { and, count, eq, isNotNull, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { expenses, itineraryItems, journalEntries } from '@/lib/db/schema';
import { describeStrategy } from '@/lib/domain/dates/strategy';
import { buildRecap, type RecapView } from '@/lib/domain/recap';
import { budgetSummary, listExpenses, listJournal, listTravelers } from './expenses';
import { listItems, tripDays } from './itinerary';
import type { TripRow } from './trips';

/**
 * The Recap tab becomes visible once the trip has a story to tell: any logged
 * outcome, rating, journal entry or expense — or a status already past
 * planning (booked / in_progress / completed). Read-only, no recordEvent.
 */
export async function hasRecapContent(trip: TripRow): Promise<boolean> {
  if (trip.status === 'booked' || trip.status === 'in_progress' || trip.status === 'completed') {
    return true;
  }
  const [marked, journal, spent] = await Promise.all([
    db
      .select({ n: count() })
      .from(itineraryItems)
      .where(
        and(
          eq(itineraryItems.tripId, trip.id),
          or(ne(itineraryItems.outcome, 'planned'), isNotNull(itineraryItems.rating)),
        ),
      ),
    db.select({ n: count() }).from(journalEntries).where(eq(journalEntries.tripId, trip.id)),
    db.select({ n: count() }).from(expenses).where(eq(expenses.tripId, trip.id)),
  ]);
  return (
    Number(marked[0]?.n ?? 0) + Number(journal[0]?.n ?? 0) + Number(spent[0]?.n ?? 0) > 0
  );
}

/** Role-checked view-model for the recap page (callers run requireTripRole). */
export async function loadRecap(trip: TripRow): Promise<RecapView> {
  const [items, journal, exps, tvl, budget] = await Promise.all([
    listItems(trip.id),
    listJournal(trip.id),
    listExpenses(trip.id),
    listTravelers(trip.id),
    budgetSummary(trip.id, trip.currency),
  ]);
  const range = tripDays(trip);
  const plannedTotal = Object.values(budget.plannedByCategory).reduce((a, b) => a + b, 0);
  return buildRecap({
    trip: {
      name: trip.name,
      status: trip.status,
      originCity: trip.origin.city,
      destinationCity: trip.destination.city,
      currency: trip.currency,
    },
    dates: trip.startDate ? { start: trip.startDate, end: trip.endDate } : null,
    planLabel: trip.startDate ? null : describeStrategy(trip.dateStrategy, trip.timePrefs),
    days: range?.days ?? [],
    travelers: tvl.map((t) => ({ id: t.id, name: t.displayName })),
    items: items.map((i) => ({
      id: i.id,
      day: i.day,
      title: i.title,
      kind: i.kind,
      startTime: i.startTime,
      endTime: i.endTime,
      sortOrder: i.sortOrder,
      outcome: i.outcome,
      outcomeNotes: i.outcomeNotes,
      rating: i.rating,
      system: i.system,
    })),
    journal: journal.map(({ j, authorName }) => ({
      id: j.id,
      day: j.day,
      body: j.body,
      author: authorName,
    })),
    expenses: exps.map(({ expense, shares }) => ({
      id: expense.id,
      description: expense.description,
      category: expense.category,
      amountBaseCents: Math.round(Number(expense.amountBase) * 100),
      paidByTravelerId: expense.paidByTravelerId,
      shares: shares.map((s) => ({
        travelerId: s.travelerId,
        shareBaseCents: Math.round(Number(s.shareBase) * 100),
      })),
    })),
    plannedCents: plannedTotal > 0 ? Math.round(plannedTotal * 100) : null,
  });
}

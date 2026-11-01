import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { todayISO } from '@/lib/clock';
import { budgetSummary, listExpenses, listTravelers } from '@/lib/services/expenses';
import { tripDays } from '@/lib/services/itinerary';
import { getTrip } from '@/lib/services/trips';
import { BudgetClient } from '@/components/budget-client';

export default async function BudgetPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { user, role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [summary, exps, tvl] = await Promise.all([
    budgetSummary(tripId, trip.currency), listExpenses(tripId), listTravelers(tripId),
  ]);
  // Default the date to today while travelling, otherwise the first trip day.
  const today = todayISO(user.homeTimezone);
  const range = tripDays(trip);
  const defaultDate = range && (today < range.start || today > range.end) ? range.start : today;
  return (
    <BudgetClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      summary={summary}
      defaultDate={defaultDate}
      defaultPayerId={tvl.find((t) => t.userId === user.id)?.id ?? tvl[0]?.id ?? ''}
      travelers={tvl.map((t) => ({ id: t.id, name: t.displayName }))}
      expenses={exps.map(({ expense, payer }) => ({
        id: expense.id, description: expense.description, category: expense.category,
        amount: Number(expense.amount), currency: expense.currency,
        amountBase: Number(expense.amountBase), spentOn: expense.spentOn, payer,
      }))}
    />
  );
}

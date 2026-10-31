import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { budgetSummary, listExpenses, listTravelers } from '@/lib/services/expenses';
import { getTrip } from '@/lib/services/trips';
import { BudgetClient } from '@/components/budget-client';

export default async function BudgetPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [summary, exps, tvl] = await Promise.all([
    budgetSummary(tripId, trip.currency), listExpenses(tripId), listTravelers(tripId),
  ]);
  return (
    <BudgetClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      summary={summary}
      travelers={tvl.map((t) => ({ id: t.id, name: t.displayName }))}
      expenses={exps.map(({ expense, payer }) => ({
        id: expense.id, description: expense.description, category: expense.category,
        amount: Number(expense.amount), currency: expense.currency,
        amountBase: Number(expense.amountBase), spentOn: expense.spentOn, payer,
      }))}
    />
  );
}

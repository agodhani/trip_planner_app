'use client';

import { useActionState } from 'react';
import { addExpenseAction, deleteExpenseAction } from '@/lib/actions/budget';
import type { ActionState } from '@/lib/actions/people';
import type { BudgetSummary } from '@/lib/services/expenses';
import { ui } from '@/components/shortlisted-options';

const { btn, btn2, card, inp } = ui;
const CATS = ['flights', 'lodging', 'food', 'activities', 'transport', 'shopping', 'fees', 'other'];
const fmt = (c: string, n: number) => `${c} ${n.toFixed(2)}`;

export function BudgetClient({ tripId, canEdit, summary, travelers, expenses }: {
  tripId: string; canEdit: boolean; summary: BudgetSummary;
  travelers: { id: string; name: string }[];
  expenses: { id: string; description: string; category: string; amount: number; currency: string; amountBase: number; spentOn: string; payer: string }[];
}) {
  const [eState, eAction] = useActionState<ActionState, FormData>(addExpenseAction, {});
  const cats = [...new Set([...Object.keys(summary.plannedByCategory), ...Object.keys(summary.actualByCategory)])];

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <h2 className="mb-2 font-semibold">Planned vs actual ({summary.currency})</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-500"><th>Category</th><th>Planned</th><th>Actual</th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c} className="border-t border-neutral-100">
                <td className="py-1 capitalize">{c}</td>
                <td>{summary.plannedByCategory[c] !== undefined ? fmt(summary.currency, summary.plannedByCategory[c]) : '—'}</td>
                <td>{summary.actualByCategory[c] !== undefined ? fmt(summary.currency, summary.actualByCategory[c]) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-sm font-medium">Total spent: {fmt(summary.currency, summary.totalActualCents / 100)}</p>
      </section>

      {summary.balances.length > 0 && (
        <section className={card}>
          <h2 className="mb-2 font-semibold">Balances</h2>
          <ul className="text-sm">
            {summary.balances.map((b) => (
              <li key={b.travelerId} className={b.netCents >= 0 ? 'text-teal-700' : 'text-red-600'}>
                {b.name}: {b.netCents >= 0 ? '+' : '−'}{fmt(summary.currency, Math.abs(b.netCents) / 100)}
              </li>
            ))}
          </ul>
          {summary.transfers.length > 0 && (
            <p className="mt-2 text-xs text-neutral-600">
              Settle up: {summary.transfers.map((t) => `${t.fromName} → ${t.toName} ${fmt(summary.currency, t.cents / 100)}`).join('; ')}
            </p>
          )}
        </section>
      )}

      <section className={card}>
        <h2 className="mb-2 font-semibold">Expenses</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-1.5">
              <span>{e.description} <span className="text-xs text-neutral-500">{e.category} · {e.spentOn} · paid by {e.payer}</span></span>
              <span className="flex items-center gap-2">
                {fmt(e.currency, e.amount)}{e.currency !== summary.currency && ` (${fmt(summary.currency, e.amountBase)})`}
                {canEdit && (
                  <form action={deleteExpenseAction}>
                    <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="expenseId" value={e.id} />
                    <button className={btn2} type="submit">×</button>
                  </form>
                )}
              </span>
            </li>
          ))}
          {expenses.length === 0 && <li className="text-xs text-neutral-400">No expenses logged yet.</li>}
        </ul>
        {canEdit && (
          <form action={eAction} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="tripId" value={tripId} />
            <input name="description" placeholder="Description" required className={`${inp} w-44`} />
            <select name="category" className={inp}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input name="amount" placeholder="0.00" type="number" step="0.01" required className={`${inp} w-24`} />
            <input name="currency" defaultValue={summary.currency} maxLength={3} className={`${inp} w-16`} />
            <input name="spentOn" type="date" required className={inp} />
            <select name="paidByTravelerId" className={inp}>
              {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input name="notes" placeholder="notes" className={`${inp} w-32`} />
            <button className={btn} type="submit">Add expense</button>
            {eState.error && <p role="alert" className="text-sm text-red-600">{eState.error}</p>}
          </form>
        )}
        <p className="mt-2 text-xs text-neutral-500">Expenses split equally among all travelers; FX via Frankfurter (ECB rates) at the spend date.</p>
      </section>
    </div>
  );
}

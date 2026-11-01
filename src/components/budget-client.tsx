'use client';

import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';
import { addExpenseAction, deleteExpenseAction } from '@/lib/actions/budget';
import type { ActionState } from '@/lib/actions/people';
import type { BudgetSummary } from '@/lib/services/expenses';
import { ui } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import { dayLabel, money } from '@/lib/ui-format';

const { btn, card, inp } = ui;
const lbl = 'flex flex-col gap-1 text-xs font-medium text-neutral-600';
const CATS = ['flights', 'lodging', 'food', 'activities', 'transport', 'shopping', 'fees', 'other'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function BudgetClient({ tripId, canEdit, summary, travelers, expenses, defaultDate, defaultPayerId }: {
  tripId: string; canEdit: boolean; summary: BudgetSummary;
  travelers: { id: string; name: string }[];
  expenses: { id: string; description: string; category: string; amount: number; currency: string; amountBase: number; spentOn: string; payer: string }[];
  defaultDate: string; defaultPayerId: string;
}) {
  const [eState, eAction] = useActionState<ActionState, FormData>(addExpenseAction, {});
  const cur = summary.currency;
  const m = (n: number) => money(n, cur, 2);
  const cats = [...new Set([
    ...Object.keys(summary.plannedByCategory), ...Object.keys(summary.estimateByCategory), ...Object.keys(summary.actualByCategory),
  ])];
  const plannedTotal = Object.values(summary.plannedByCategory).reduce((a, b) => a + b, 0);
  const spentTotal = summary.totalActualCents / 100;
  const hasEstimates = Object.keys(summary.estimateByCategory).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <h2 className="font-semibold">Planned vs actual ({cur})</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Planned counts the flights, stays, and activities you&apos;ve selected or booked. Spent comes from the expenses below.
        </p>
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Planned', value: m(plannedTotal), id: 'budget-planned', tone: '' },
            { label: 'Spent', value: m(spentTotal), id: 'budget-spent', tone: '' },
            {
              label: 'Left', value: plannedTotal ? m(plannedTotal - spentTotal) : '—', id: 'budget-left',
              tone: plannedTotal - spentTotal < 0 ? 'text-red-600' : 'text-teal-700',
            },
          ].map((s) => (
            <div key={s.id} className="rounded-lg bg-neutral-50 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{s.label}</p>
              <p data-testid={s.id} className={`text-lg font-semibold ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
        {cats.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing planned or spent yet — select options on the other tabs, or log an expense.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-1.5 font-medium">Category</th>
                <th className="py-1.5 text-right font-medium">Planned</th>
                <th className="py-1.5 text-right font-medium">Spent</th>
                <th className="py-1.5 text-right font-medium">Left</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => {
                const planned = summary.plannedByCategory[c];
                const est = summary.estimateByCategory[c];
                const spent = summary.actualByCategory[c];
                const left = planned !== undefined ? planned - (spent ?? 0) : undefined;
                return (
                  <tr key={c} className="border-b border-neutral-100">
                    <td className="py-1.5">{cap(c)}</td>
                    <td className="py-1.5 text-right">
                      {planned !== undefined ? m(planned)
                        : est ? <span className="text-neutral-500" title={`Cheapest of ${est.count} shortlisted — select one to plan it`}>est. {m(est.amount)}</span>
                        : '—'}
                    </td>
                    <td className="py-1.5 text-right">{spent !== undefined ? m(spent) : '—'}</td>
                    <td className={`py-1.5 text-right ${left !== undefined && left < 0 ? 'text-red-600' : 'text-neutral-600'}`}>
                      {left !== undefined ? m(left) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-2">Total</td>
                <td className="pt-2 text-right">{m(plannedTotal)}</td>
                <td className="pt-2 text-right">{m(spentTotal)}</td>
                <td className={`pt-2 text-right ${plannedTotal - spentTotal < 0 ? 'text-red-600' : ''}`}>{plannedTotal ? m(plannedTotal - spentTotal) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        )}
        {hasEstimates && (
          <p className="mt-2 text-xs text-neutral-500">“est.” is the cheapest shortlisted option where nothing is selected yet — it isn&apos;t included in the total.</p>
        )}
      </section>

      {summary.balances.length > 0 && travelers.length > 1 && (
        <section className={card}>
          <h2 className="font-semibold">Who owes whom</h2>
          <p className="mb-2 text-xs text-neutral-500">Positive means the group owes that person.</p>
          <ul className="flex flex-col gap-1 text-sm">
            {summary.balances.map((b) => (
              <li key={b.travelerId} className="flex justify-between">
                <span>{b.name}</span>
                <span className={b.netCents >= 0 ? 'font-medium text-teal-700' : 'font-medium text-red-600'}>
                  {b.netCents >= 0 ? '+' : '−'}{m(Math.abs(b.netCents) / 100)}
                </span>
              </li>
            ))}
          </ul>
          {summary.transfers.length > 0 && (
            <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">To settle up</p>
              {summary.transfers.map((t, i) => (
                <p key={i}>{t.fromName} pays {t.toName} <span className="font-medium">{m(t.cents / 100)}</span></p>
              ))}
            </div>
          )}
        </section>
      )}

      <section className={card}>
        <h2 className="font-semibold">Expenses</h2>
        <p className="mb-3 text-xs text-neutral-500">Split equally among all travelers. Foreign currencies convert at the ECB rate for the spend date (Frankfurter).</p>
        <ul className="flex flex-col text-sm">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2">
              <span className="min-w-0">
                <span className="font-medium">{e.description}</span>
                <span className="block text-xs text-neutral-500">{cap(e.category)} · {dayLabel(e.spentOn)} · paid by {e.payer}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-right">
                <span>
                  <span className="font-medium">{money(e.amount, e.currency, 2)}</span>
                  {e.currency !== cur && <span className="block text-xs text-neutral-500">({m(e.amountBase)})</span>}
                </span>
                {canEdit && (
                  <form action={deleteExpenseAction}>
                    <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="expenseId" value={e.id} />
                    <SubmitButton className="rounded-md border border-neutral-200 p-1 text-neutral-500 hover:bg-neutral-100 hover:text-red-600" aria-label="Delete expense" title="Delete expense">
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </SubmitButton>
                  </form>
                )}
              </span>
            </li>
          ))}
          {expenses.length === 0 && <li className="text-xs text-neutral-400">No expenses logged yet.</li>}
        </ul>
        {canEdit && (
          <form action={eAction} className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <input type="hidden" name="tripId" value={tripId} />
            <label className={`${lbl} col-span-2`}>What was it?<input name="description" placeholder="Description" required className={inp} /></label>
            <label className={lbl}>Category
              <select name="category" className={inp} defaultValue="food">{CATS.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</select>
            </label>
            <label className={lbl}>Date<input name="spentOn" type="date" required defaultValue={defaultDate} className={inp} /></label>
            <label className={lbl}>Amount<input name="amount" placeholder="0.00" type="number" step="0.01" min="0.01" required className={inp} /></label>
            <label className={lbl}>Currency<input name="currency" defaultValue={cur} maxLength={3} className={`${inp} uppercase`} /></label>
            <label className={lbl}>Paid by
              <select name="paidByTravelerId" className={inp} defaultValue={defaultPayerId}>
                {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className={lbl}>Notes<input name="notes" placeholder="optional" className={inp} /></label>
            <div className="col-span-full flex items-center gap-3">
              <SubmitButton className={btn}>Add expense</SubmitButton>
              {eState.error && <p role="alert" className="text-sm text-red-600">{eState.error}</p>}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

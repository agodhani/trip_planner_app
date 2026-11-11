'use client';

import { useActionState, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { addExpenseAction, deleteExpenseAction, setBudgetAction } from '@/lib/actions/budget';
import type { ActionState } from '@/lib/actions/people';
import { perPersonCents, type ExpenseCategory } from '@/lib/domain/budget';
import { weightedSplit } from '@/lib/domain/money';
import type { BudgetSummary } from '@/lib/services/expenses';
import { ui } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import { dayLabel, money, plural } from '@/lib/ui-format';

const { btn, card, inp } = ui;
const lbl = 'flex flex-col gap-1 text-xs font-medium text-neutral-600';
const CATS = ['flights', 'lodging', 'food', 'activities', 'transport', 'shopping', 'fees', 'other'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type ExpenseRow = {
  id: string; description: string; category: string; amount: number; currency: string;
  amountBase: number; spentOn: string; payer: string;
  splitMethod: 'equal' | 'exact' | 'shares';
  shares: { travelerId: string; shares: number | null; exactAmount: number | null }[];
};

/** Stacked bar: dark = spent, light = still committed, tick = cap. Red when over. */
function CapBar({ spentCents, committedCents, capCents }: {
  spentCents: number; committedCents: number; capCents?: number;
}) {
  const due = spentCents + committedCents;
  const max = Math.max(capCents ?? 0, due, 1);
  const over = capCents !== undefined && due > capCents;
  const spentPct = (spentCents / max) * 100;
  const committedPct = (committedCents / max) * 100;
  return (
    <div className="relative h-3 w-full overflow-hidden rounded bg-neutral-100">
      <div
        className={`absolute inset-y-0 left-0 ${over ? 'bg-red-500' : 'bg-teal-600'}`}
        style={{ width: `${spentPct}%` }}
      />
      <div
        className={`absolute inset-y-0 ${over ? 'bg-red-300' : 'bg-teal-300'}`}
        style={{ left: `${spentPct}%`, width: `${committedPct}%` }}
      />
      {capCents !== undefined && (
        <div
          className="absolute inset-y-0 w-0.5 bg-neutral-700"
          style={{ left: `calc(${(capCents / max) * 100}% - 1px)` }}
        />
      )}
    </div>
  );
}

export function BudgetClient({ tripId, canEdit, summary, travelers, expenses, defaultDate, defaultPayerId }: {
  tripId: string; canEdit: boolean; summary: BudgetSummary;
  travelers: { id: string; name: string }[];
  expenses: ExpenseRow[];
  defaultDate: string; defaultPayerId: string;
}) {
  const [eState, eAction] = useActionState<ActionState, FormData>(addExpenseAction, {});
  const [bState, bAction] = useActionState<ActionState, FormData>(setBudgetAction, {});
  const cur = summary.currency;
  const m = (n: number) => money(n, cur, 2);
  const mc = (cents: number) => m(cents / 100);
  const nameOf = (id: string) => travelers.find((t) => t.id === id)?.name ?? '?';

  // Caps live in integer cents. The effective total is the explicit total
  // cap, else the sum of any category caps; nothing → budget tracking off.
  const caps = summary.caps;
  const catCapSum = Object.values(caps.byCategory).reduce((a, b) => a + (b ?? 0), 0);
  const effectiveCapCents = caps.totalCents ?? (Object.keys(caps.byCategory).length ? catCapSum : null);
  const hasBudget = effectiveCapCents !== null;
  /** Only read inside the hasBudget branch — guaranteed non-null there. */
  const capTotalCents = effectiveCapCents ?? 0;
  const totalDueCents = summary.totalActualCents + summary.totalCommittedCents;
  const overallOver = hasBudget ? Math.max(0, totalDueCents - capTotalCents) : 0;
  /** 'each' share as a single value, or 'min–max' when remainder cents differ. */
  const perEach = (totalCents: number): string | null => {
    const shares = perPersonCents(totalCents, travelers.length);
    if (!shares.length) return null;
    const min = Math.min(...shares), max = Math.max(...shares);
    return min === max ? mc(min) : `${mc(min)}–${mc(max)}`;
  };

  // Controlled so React's post-action form reset can't drop them; we reset
  // ourselves when the action reports success.
  const [amount, setAmount] = useState('');
  const [currencyInp, setCurrencyInp] = useState(cur);
  const [splitMethod, setSplitMethod] = useState<'equal' | 'exact' | 'shares'>('equal');
  // Track who's OUT so a traveler added mid-session defaults to included.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [exact, setExact] = useState<Record<string, string>>({});
  const [shareVals, setShareVals] = useState<Record<string, string>>({});
  const [lastState, setLastState] = useState(eState);
  if (eState !== lastState) {
    setLastState(eState);
    if (!eState.error) {
      setAmount(''); setCurrencyInp(cur);
      setSplitMethod('equal');
      setExcluded(new Set());
      setExact({}); setShareVals({});
    }
  }

  const amountCents = Math.round(Number(amount) * 100);
  const validAmount = amount.trim() !== '' && Number.isFinite(Number(amount)) && amountCents > 0;
  const fmtCur = /^[A-Za-z]{3}$/.test(currencyInp.trim()) ? currencyInp.trim().toUpperCase() : cur;
  const checkedIds = travelers.filter((t) => !excluded.has(t.id)).map((t) => t.id);
  const exactSum = travelers.reduce((a, t) => a + Math.round(Number(exact[t.id] ?? '') * 100 || 0), 0);
  const shareWeights = travelers.map((t) => {
    const n = Number(shareVals[t.id] ?? '1');
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const sharesPreview = (() => {
    if (!validAmount || !shareWeights.some((w) => w > 0)) return null;
    try {
      return weightedSplit(amountCents, shareWeights);
    } catch {
      return null;
    }
  })();
  const splitValid =
    splitMethod === 'equal' ? checkedIds.length > 0
    : splitMethod === 'exact' ? validAmount && exactSum === amountCents
    : shareWeights.some((w) => w > 0);

  const splitSummary = (e: ExpenseRow): string => {
    if (e.splitMethod === 'exact') {
      return `exact: ${e.shares.map((s) => `${nameOf(s.travelerId)} ${money(s.exactAmount ?? 0, e.currency, 2)}`).join(' · ')}`;
    }
    if (e.splitMethod === 'shares') {
      return `shares: ${e.shares.map((s) => `${nameOf(s.travelerId)} ${s.shares ?? 0}`).join(' · ')}`;
    }
    if (e.shares.length === travelers.length) return 'split equally';
    return `split equally: ${e.shares.map((s) => nameOf(s.travelerId)).join(', ')}`;
  };
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

      {(canEdit || hasBudget) && (
        <section className={card}>
          <h2 className="font-semibold">Trip budget</h2>
          <p className="mb-3 text-xs text-neutral-500">
            A cap for the whole trip or per category. Committed is what you still owe on selected/booked
            options after the expenses logged against them — the tick marks the cap.
          </p>
          {canEdit && (
            <details className="mb-3">
              <summary className="inline-flex cursor-pointer list-none items-center text-xs font-medium text-teal-700 hover:underline [&::-webkit-details-marker]:hidden">
                {hasBudget ? 'Edit budget caps' : 'Set a budget'}
              </summary>
              {/* key remounts the uncontrolled inputs when caps change server-side. */}
              <form key={JSON.stringify(caps)} action={bAction} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="tripId" value={tripId} />
                <label className={`${lbl} max-w-40`}>Total cap ({cur})
                  <input
                    name="budgetTotal" type="number" step="0.01" min="0" placeholder="no cap"
                    defaultValue={caps.totalCents === null ? '' : caps.totalCents / 100}
                    className={inp}
                  />
                </label>
                <div>
                  <p className="mb-1 text-xs text-neutral-500">Category caps (optional — blank means none)</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CATS.map((c) => {
                      const v = caps.byCategory[c as ExpenseCategory];
                      return (
                        <label key={c} className={lbl}>{cap(c)}
                          <input
                            name={`cap:${c}`} type="number" step="0.01" min="0" placeholder="—"
                            defaultValue={v === undefined ? '' : v / 100}
                            className={inp}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <SubmitButton className={btn}>Save budget</SubmitButton>
                  {bState.error && <p role="alert" className="text-sm text-red-600">{bState.error}</p>}
                </div>
              </form>
            </details>
          )}
          {hasBudget ? (
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">Overall</span>
                  <span className="text-xs text-neutral-600">
                    spent {mc(summary.totalActualCents)} · committed {mc(summary.totalCommittedCents)} · cap {mc(capTotalCents)}
                  </span>
                </div>
                <CapBar spentCents={summary.totalActualCents} committedCents={summary.totalCommittedCents} capCents={capTotalCents} />
                <p className="mt-1 text-xs">
                  {overallOver > 0 ? (
                    <span className="font-medium text-red-600" data-testid="cap-over">over by {mc(overallOver)}</span>
                  ) : (
                    <span className="font-medium text-teal-700" data-testid="cap-left">{mc(capTotalCents - totalDueCents)} left</span>
                  )}
                </p>
              </div>
              {summary.rollups.length > 0 && (
                <ul className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
                  {summary.rollups.map((r) => (
                    <li key={r.category} data-testid={`cat-bar-${r.category}`}>
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span>{cap(r.category)}{r.capCents !== undefined ? ` — cap ${mc(r.capCents)}` : ''}</span>
                        <span className="text-xs text-neutral-600">spent {mc(r.spentCents)} · committed {mc(r.committedCents)}</span>
                      </div>
                      <CapBar spentCents={r.spentCents} committedCents={r.committedCents} capCents={r.capCents} />
                      {r.overCents !== undefined && r.overCents > 0 && (
                        <p className="mt-0.5 text-xs font-medium text-red-600" data-testid={`cat-over-${r.category}`}>over by {mc(r.overCents)}</p>
                      )}
                      {r.leftCents !== undefined && r.overCents === 0 && (
                        <p className="mt-0.5 text-xs text-teal-700" data-testid={`cat-left-${r.category}`}>{mc(r.leftCents)} left</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="border-t border-neutral-100 pt-2 text-sm font-medium" data-testid="cap-totals">
                Total: spent {mc(summary.totalActualCents)} · committed {mc(summary.totalCommittedCents)} · cap {mc(capTotalCents)}
              </p>
              {/* Per-capita figures only make sense while a cap exists. */}
              {travelers.length > 0 && (
                <p className="text-xs text-neutral-600" data-testid="per-person-line">
                  Per person ({plural(travelers.length, 'traveler')}): cap {perEach(capTotalCents)} · spent {perEach(summary.totalActualCents)}
                  {summary.totalCommittedCents > 0 ? ` · committed ${perEach(summary.totalCommittedCents)}` : ''}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              No budget set yet{canEdit ? ' — set a total or per-category caps above to track against' : ''}.
            </p>
          )}
        </section>
      )}

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
        <p className="mb-3 text-xs text-neutral-500">
          {travelers.length >= 2
            ? 'Split each expense equally, by exact amounts, or by shares (e.g. 2 for a couple). '
            : 'Split equally among all travelers. '}
          Foreign currencies convert at the ECB rate for the spend date (Frankfurter).
        </p>
        <ul className="flex flex-col text-sm">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2">
              <span className="min-w-0">
                <span className="font-medium">{e.description}</span>
                <span className="block text-xs text-neutral-500">{cap(e.category)} · {dayLabel(e.spentOn)} · paid by {e.payer} · {splitSummary(e)}</span>
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
            <label className={lbl}>Amount<input name="amount" placeholder="0.00" type="number" step="0.01" min="0.01" required
              value={amount} onChange={(e) => setAmount(e.target.value)} className={inp} /></label>
            <label className={lbl}>Currency<input name="currency" value={currencyInp} maxLength={3}
              onChange={(e) => setCurrencyInp(e.target.value.toUpperCase())} className={`${inp} uppercase`} /></label>
            <label className={lbl}>Paid by
              <select name="paidByTravelerId" className={inp} defaultValue={defaultPayerId}>
                {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className={lbl}>Notes<input name="notes" placeholder="optional" className={inp} /></label>
            {travelers.length >= 2 && (
              <div className="col-span-full flex flex-col gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                <input type="hidden" name="splitMethod" value={splitMethod} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-neutral-600">Split</span>
                  {([['equal', 'Equally'], ['exact', 'Exact amounts'], ['shares', 'By shares']] as const).map(([k, label]) => (
                    <button
                      key={k} type="button" aria-pressed={splitMethod === k} onClick={() => setSplitMethod(k)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${splitMethod === k ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {splitMethod === 'equal' && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {travelers.map((t) => (
                      <label key={t.id} className="flex items-center gap-1.5 text-xs text-neutral-700">
                        <input
                          type="checkbox" name="splitWith" value={t.id} checked={!excluded.has(t.id)}
                          onChange={(e) => setExcluded((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.delete(t.id); else n.add(t.id);
                            return n;
                          })}
                          className="accent-teal-600"
                        />
                        {t.name}
                      </label>
                    ))}
                    {validAmount && checkedIds.length > 0 && (
                      <span className="text-xs text-neutral-500">{money(amountCents / checkedIds.length / 100, fmtCur, 2)} each</span>
                    )}
                  </div>
                )}
                {splitMethod === 'exact' && (
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {travelers.map((t) => (
                        <label key={t.id} className="flex items-center gap-1.5 text-xs text-neutral-700">
                          {t.name}
                          <input
                            name={`exact:${t.id}`} type="number" step="0.01" min="0" aria-label={`${t.name}'s amount`}
                            value={exact[t.id] ?? ''}
                            onChange={(e) => setExact((s) => ({ ...s, [t.id]: e.target.value }))}
                            className={`${inp} w-24`}
                          />
                        </label>
                      ))}
                    </div>
                    {validAmount && (
                      <p className="text-xs text-neutral-500">
                        {exactSum === amountCents
                          ? `Adds up to ${money(amountCents / 100, fmtCur, 2)}`
                          : `Assigned ${money(exactSum / 100, fmtCur, 2)} of ${money(amountCents / 100, fmtCur, 2)} — ${money(Math.abs(amountCents - exactSum) / 100, fmtCur, 2)} ${exactSum < amountCents ? 'left' : 'over'}`}
                      </p>
                    )}
                  </div>
                )}
                {splitMethod === 'shares' && (
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {travelers.map((t) => (
                        <label key={t.id} className="flex items-center gap-1.5 text-xs text-neutral-700">
                          {t.name}
                          <input
                            name={`shares:${t.id}`} type="number" min="0" step="any" aria-label={`${t.name}'s shares`}
                            value={shareVals[t.id] ?? '1'}
                            onChange={(e) => setShareVals((s) => ({ ...s, [t.id]: e.target.value }))}
                            className={`${inp} w-20`}
                          />
                        </label>
                      ))}
                    </div>
                    {sharesPreview && (
                      <p className="text-xs text-neutral-500">
                        {travelers
                          .map((t, i) => ({ name: t.name, cents: sharesPreview[i] }))
                          .filter((p) => p.cents > 0)
                          .map((p) => `${p.name} ${money(p.cents / 100, fmtCur, 2)}`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="col-span-full flex items-center gap-3">
              <SubmitButton className={btn} disabled={travelers.length >= 2 && !splitValid}>Add expense</SubmitButton>
              {eState.error && <p role="alert" className="text-sm text-red-600">{eState.error}</p>}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

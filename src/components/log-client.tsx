'use client';

import { useActionState } from 'react';
import { itemOutcomeAction, journalAction, tripStatusAction } from '@/lib/actions/budget';
import type { ActionState } from '@/lib/actions/people';
import { ui } from '@/components/shortlisted-options';

const { btn, btn2, card, inp } = ui;

type Item = { id: string; day: string | null; title: string; kind: string; outcome: string; outcomeNotes: string | null; rating: number | null; unplanned: boolean };
const OUTCOMES = ['planned', 'done', 'skipped', 'changed'];
const STATUSES = ['planning', 'booked', 'in_progress', 'completed', 'cancelled'];

export function LogClient({ tripId, canEdit, status, items, journal }: {
  tripId: string; canEdit: boolean; status: string;
  items: Item[]; journal: { id: string; day: string | null; body: string }[];
}) {
  const [jState, jAction] = useActionState<ActionState, FormData>(journalAction, {});
  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-600">Trip status: <span className="font-medium">{status}</span></p>
          {canEdit && (
            <form action={tripStatusAction} className="flex items-center gap-2">
              <input type="hidden" name="tripId" value={tripId} />
              <select name="status" defaultValue={status} className={inp}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className={btn2} type="submit">Update</button>
            </form>
          )}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">What actually happened</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-2">
              <span className="w-20 text-xs text-neutral-500">{i.day ?? 'pool'}</span>
              <span className="flex-1">{i.title}
                {i.rating ? <span className="ml-1 text-xs text-amber-600">{'★'.repeat(i.rating)}</span> : null}
                {i.outcomeNotes && <span className="ml-1 text-xs text-neutral-500">· {i.outcomeNotes}</span>}
              </span>
              {canEdit ? (
                <form action={itemOutcomeAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={i.id} />
                  <select name="outcome" defaultValue={i.outcome} className={`${inp} text-xs`}>
                    {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <select name="rating" defaultValue={i.rating ?? ''} className={`${inp} text-xs`}>
                    <option value="">—</option>{[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{r}★</option>)}
                  </select>
                  <input name="notes" placeholder="what happened" defaultValue={i.outcomeNotes ?? ''} className={`${inp} w-32 text-xs`} />
                  <button className={btn2} type="submit">Save</button>
                </form>
              ) : (
                <span className="rounded bg-neutral-100 px-1.5 text-xs">{i.outcome}</span>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="text-xs text-neutral-400">Nothing on the itinerary yet.</li>}
        </ul>
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Journal</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {journal.map((j) => (
            <li key={j.id}><span className="text-xs text-neutral-500">{j.day ?? '—'}: </span>{j.body}</li>
          ))}
          {journal.length === 0 && <li className="text-xs text-neutral-400">No entries yet.</li>}
        </ul>
        {canEdit && (
          <form action={jAction} className="mt-3 flex gap-2 text-sm">
            <input type="hidden" name="tripId" value={tripId} />
            <input name="day" type="date" className={inp} />
            <input name="body" placeholder="What happened today…" className={`${inp} flex-1`} />
            <button className={btn} type="submit">Add entry</button>
            {jState.error && <p className="text-xs text-red-600">{jState.error}</p>}
          </form>
        )}
      </section>
    </div>
  );
}

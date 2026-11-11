'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { BookOpenText } from 'lucide-react';
import { itemOutcomeAction, journalAction, tripStatusAction } from '@/lib/actions/budget';
import type { ActionState } from '@/lib/actions/people';
import { ui } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import { dayLabel } from '@/lib/ui-format';

const { btn, btn2, card, inp } = ui;

type Item = { id: string; day: string | null; title: string; kind: string; outcome: string; outcomeNotes: string | null; rating: number | null; unplanned: boolean };
const OUTCOMES = [['planned', 'Planned'], ['done', 'Done'], ['skipped', 'Skipped'], ['changed', 'Changed']] as const;
const STATUSES = [
  ['planning', 'Planning'], ['booked', 'Booked'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['cancelled', 'Cancelled'],
] as const;
const OUTCOME_STYLE: Record<string, string> = {
  done: 'bg-teal-100 text-teal-800', skipped: 'bg-neutral-200 text-neutral-600', changed: 'bg-amber-100 text-amber-800',
};

function LogRow({ i, tripId, canEdit }: { i: Item; tripId: string; canEdit: boolean }) {
  const [saving, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  // Save on pick without submitting the form, so React doesn't reset the
  // notes field someone may still be typing in.
  const autoSave = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fd = new FormData(e.currentTarget.form!);
    setSaved(false);
    startTransition(async () => { await itemOutcomeAction(fd); setSaved(true); });
  };
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-100 px-3 py-2">
      <span className="min-w-40 flex-1">
        {i.title}
        {i.rating ? <span className="ml-1.5 text-xs text-amber-600" aria-label={`${i.rating} of 5 stars`}>{'★'.repeat(i.rating)}</span> : null}
        {i.outcomeNotes && <span className="ml-1.5 text-xs text-neutral-500">· {i.outcomeNotes}</span>}
      </span>
      {canEdit ? (
        <form action={itemOutcomeAction} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={i.id} />
          <select name="outcome" aria-label="Outcome" defaultValue={i.outcome} className={`${inp} text-xs`} onChange={autoSave}>
            {OUTCOMES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <select name="rating" aria-label="Rating" defaultValue={i.rating ?? ''} className={`${inp} text-xs`} onChange={autoSave}>
            <option value="">No rating</option>{[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{r}★</option>)}
          </select>
          <input name="notes" placeholder="what happened" aria-label="Notes" defaultValue={i.outcomeNotes ?? ''} className={`${inp} w-40 text-xs`} />
          <SubmitButton className={btn2}>Save</SubmitButton>
          <span role="status" className="w-14 text-xs text-teal-700">{saving ? 'Saving…' : saved ? 'Saved' : ''}</span>
        </form>
      ) : (
        <span className={`rounded px-1.5 text-xs ${OUTCOME_STYLE[i.outcome] ?? 'bg-neutral-100'}`}>{i.outcome}</span>
      )}
    </li>
  );
}

export function LogClient({ tripId, canEdit, status, items, journal, days, defaultDay, recapReady }: {
  tripId: string; canEdit: boolean; status: string; days: string[]; defaultDay: string;
  items: Item[]; journal: { id: string; day: string | null; body: string }[];
  /** A story already exists — link through to the read-only Recap. */
  recapReady: boolean;
}) {
  const [jState, jAction] = useActionState<ActionState, FormData>(journalAction, {});
  const dayName = (d: string | null) => {
    if (!d) return 'Unscheduled';
    const i = days.indexOf(d);
    return i >= 0 ? `Day ${i + 1} · ${dayLabel(d)}` : dayLabel(d);
  };
  const groups = new Map<string, Item[]>();
  for (const i of items) groups.set(i.day ?? '', [...(groups.get(i.day ?? '') ?? []), i]);
  const orderedDays = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));

  return (
    <div className="flex flex-col gap-6">
      {recapReady && (
        <Link
          href={`/trips/${tripId}/recap`}
          data-testid="log-recap-link"
          className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100"
        >
          <BookOpenText aria-hidden className="h-4 w-4" />
          See the trip recap — the story so far, ready to print or share
        </Link>
      )}
      <section className={card}>
        <h2 className="font-semibold">Trip status</h2>
        <p className="mb-2 text-xs text-neutral-500">Moves the trip between sections on your trips list.</p>
        {canEdit ? (
          <form action={tripStatusAction} className="flex flex-wrap gap-1.5" role="group" aria-label="Trip status">
            <input type="hidden" name="tripId" value={tripId} />
            {STATUSES.map(([value, label]) => (
              <button
                key={value} type="submit" name="status" value={value} aria-pressed={status === value}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${status === value ? 'border-teal-600 bg-teal-600 text-white' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}
              >
                {label}
              </button>
            ))}
          </form>
        ) : (
          <p className="text-sm font-medium">{STATUSES.find(([v]) => v === status)?.[1] ?? status}</p>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold">What actually happened</h2>
        <p className="mb-3 text-xs text-neutral-500">Mark each plan as done, skipped, or changed — it saves as soon as you pick.</p>
        {items.length === 0 && <p className="text-xs text-neutral-400">Nothing on the itinerary yet.</p>}
        <div className="flex flex-col gap-4">
          {orderedDays.map((d) => (
            <div key={d || 'pool'}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{dayName(d || null)}</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {groups.get(d)!.map((i) => <LogRow key={i.id} i={i} tripId={tripId} canEdit={canEdit} />)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Journal</h2>
        <p className="mb-3 text-xs text-neutral-500">Notes and memories, shared with everyone on the trip.</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {journal.map((j) => (
            <li key={j.id}><span className="text-xs font-medium text-neutral-500">{j.day ? dayLabel(j.day) : 'Undated'}: </span>{j.body}</li>
          ))}
          {journal.length === 0 && <li className="text-xs text-neutral-400">No entries yet.</li>}
        </ul>
        {canEdit && (
          <form action={jAction} className="mt-3 flex flex-wrap gap-2 text-sm">
            <input type="hidden" name="tripId" value={tripId} />
            <input name="day" type="date" aria-label="Day" defaultValue={defaultDay} className={inp} />
            <input name="body" placeholder="What happened today…" aria-label="Journal entry" className={`${inp} min-w-48 flex-1`} />
            <SubmitButton className={btn}>Add entry</SubmitButton>
            {jState.error && <p className="w-full text-xs text-red-600">{jState.error}</p>}
          </form>
        )}
      </section>
    </div>
  );
}

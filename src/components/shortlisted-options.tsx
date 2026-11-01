'use client';

import { useActionState } from 'react';
import {
  deleteOptionAction, optionCommentAction, optionStatusAction, voteAction,
} from '@/lib/actions/options';
import type { ActionState } from '@/lib/actions/people';

export type ShortlistedOption = {
  id: string; title: string; subtitle: string | null; status: string;
  price: number | null; currency: string | null; bookingUrl: string | null;
  bookingRef: string | null; source: string;
  votes: { score: number; voters: { name: string; value: number }[] };
  comments: { id: string; body: string; author: string }[];
};

const btn = 'rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';
const btn2 = 'rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100';
const card = 'rounded-xl border border-neutral-200 bg-white p-4 shadow-sm';
const inp = 'rounded-lg border border-neutral-300 px-2 py-1 text-sm';

export const ui = { btn, btn2, card, inp };

export function HiddenIds({ tripId, section, optionId }: { tripId: string; section: string; optionId: string }) {
  return (
    <>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="optionId" value={optionId} />
    </>
  );
}

/** Shortlisted options list: votes, status flow, comments — shared across tabs. */
export function ShortlistedOptions({
  tripId, section, title = 'Shortlisted', canEdit, options,
}: {
  tripId: string;
  section: 'flights' | 'stay' | 'activities' | 'transport' | 'itinerary' | 'budget' | 'log' | 'shortlist';
  title?: string;
  canEdit: boolean;
  options: ShortlistedOption[];
}) {
  const [cState, cAction] = useActionState<ActionState, FormData>(optionCommentAction, {});
  if (!options.length) return null;
  return (
    <section className={card}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="flex flex-col gap-4">
        {options.map((o) => (
          <li key={o.id} className="rounded-lg border border-neutral-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{o.title}
                  <span className={`ml-2 rounded px-1.5 text-xs ${
                    o.status === 'selected' || o.status === 'booked'
                      ? 'bg-teal-100 text-teal-800'
                      : o.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-neutral-100'
                  }`}>{o.status}</span>
                  {o.source === 'manual' && <span className="ml-1 rounded bg-neutral-100 px-1.5 text-xs">manual</span>}
                </p>
                <p className="text-xs text-neutral-500">
                  {o.subtitle}
                  {o.price !== null && ` · ${o.currency ?? '$'}${Math.round(o.price)}`}
                  {o.bookingRef && ` · conf ${o.bookingRef}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <form action={voteAction}>
                  <HiddenIds tripId={tripId} section={section} optionId={o.id} /><input type="hidden" name="value" value="1" />
                  <button className={btn2} type="submit" aria-label="Vote up">+{o.votes.voters.filter((v) => v.value === 1).length}</button>
                </form>
                <form action={voteAction}>
                  <HiddenIds tripId={tripId} section={section} optionId={o.id} /><input type="hidden" name="value" value="-1" />
                  <button className={btn2} type="submit" aria-label="Vote down">−{o.votes.voters.filter((v) => v.value === -1).length}</button>
                </form>
                {canEdit && o.status !== 'selected' && o.status !== 'booked' && (
                  <form action={optionStatusAction}>
                    <HiddenIds tripId={tripId} section={section} optionId={o.id} /><input type="hidden" name="status" value="selected" />
                    <button className={btn} type="submit">Select</button>
                  </form>
                )}
                {canEdit && o.status === 'selected' && (
                  <form action={optionStatusAction} className="flex gap-1">
                    <HiddenIds tripId={tripId} section={section} optionId={o.id} /><input type="hidden" name="status" value="booked" />
                    <input name="bookingRef" placeholder="Conf #" className={`${inp} w-24`} />
                    <button className={btn} type="submit">Mark booked</button>
                  </form>
                )}
                {canEdit && (
                  <form action={deleteOptionAction}>
                    <HiddenIds tripId={tripId} section={section} optionId={o.id} />
                    <button className={btn2} type="submit">Remove</button>
                  </form>
                )}
                {o.bookingUrl && <a href={o.bookingUrl} target="_blank" rel="noopener noreferrer" className={btn2}>Book</a>}
              </div>
            </div>
            {o.votes.voters.length > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                {o.votes.voters.map((v) => `${v.name} ${v.value === 1 ? '+' : '−'}`).join(', ')} · score {o.votes.score}
              </p>
            )}
            {o.comments.map((c) => (
              <p key={c.id} className="mt-1 text-xs"><span className="font-medium">{c.author}:</span> {c.body}</p>
            ))}
            <form action={cAction} className="mt-2 flex gap-2">
              <HiddenIds tripId={tripId} section={section} optionId={o.id} />
              <input name="body" placeholder="Comment…" aria-label="Option comment" className={`${inp} flex-1`} />
              <button className={btn2} type="submit">Post</button>
            </form>
            {cState.error && <p className="text-xs text-red-600">{cState.error}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

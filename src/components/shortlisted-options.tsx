'use client';

import { useActionState } from 'react';
import { ExternalLink, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import {
  deleteOptionAction, optionCommentAction, optionStatusAction, voteAction,
} from '@/lib/actions/options';
import type { ActionState } from '@/lib/actions/people';
import { SubmitButton } from '@/components/submit-button';
import { money } from '@/lib/ui-format';

export type ShortlistedOption = {
  id: string; title: string; subtitle: string | null; status: string;
  price: number | null; currency: string | null; bookingUrl: string | null;
  bookingRef: string | null; source: string; externalId?: string | null;
  kind?: string;
  votes: { score: number; voters: { name: string; value: number }[] };
  comments: { id: string; body: string; author: string }[];
};

const btn = 'rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';
const btn2 = 'rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const card = 'rounded-xl border border-neutral-200 bg-white p-4 shadow-sm';
const inp = 'rounded-lg border border-neutral-300 px-2 py-1 text-sm';

export const ui = { btn, btn2, card, inp };

const STATUS_STYLE: Record<string, string> = {
  selected: 'bg-teal-100 text-teal-800',
  booked: 'bg-teal-600 text-white',
  rejected: 'bg-red-50 text-red-600',
};

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
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-neutral-500">Vote and comment together, then Select the one you want — it feeds the budget and itinerary.</p>
      <ul className="flex flex-col gap-3">
        {options.map((o) => {
          const ups = o.votes.voters.filter((v) => v.value === 1);
          const downs = o.votes.voters.filter((v) => v.value === -1);
          const chosen = o.status === 'selected' || o.status === 'booked';
          return (
            <li key={o.id} className={`rounded-lg border p-3 ${chosen ? 'border-teal-300 bg-teal-50/40' : 'border-neutral-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{o.title}
                    <span className={`ml-2 rounded px-1.5 text-xs ${STATUS_STYLE[o.status] ?? 'bg-neutral-100'}`}>{o.status}</span>
                    {o.source === 'manual' && <span className="ml-1 rounded bg-neutral-100 px-1.5 text-xs">manual</span>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {o.subtitle}
                    {o.bookingRef && ` · Confirmation ${o.bookingRef}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {o.price !== null && <span className="mr-1 text-sm font-semibold">{money(o.price, o.currency ?? 'USD')}</span>}
                  <form action={voteAction}>
                    <HiddenIds tripId={tripId} section={section} optionId={o.id} /><input type="hidden" name="value" value="1" />
                    <SubmitButton className={btn2} aria-label="Vote up" title={ups.length ? `Up: ${ups.map((v) => v.name).join(', ')}` : 'Vote up'}>
                      <ThumbsUp aria-hidden className="h-3.5 w-3.5" />{ups.length}
                    </SubmitButton>
                  </form>
                  <form action={voteAction}>
                    <HiddenIds tripId={tripId} section={section} optionId={o.id} /><input type="hidden" name="value" value="-1" />
                    <SubmitButton className={btn2} aria-label="Vote down" title={downs.length ? `Down: ${downs.map((v) => v.name).join(', ')}` : 'Vote down'}>
                      <ThumbsDown aria-hidden className="h-3.5 w-3.5" />{downs.length}
                    </SubmitButton>
                  </form>
                  {canEdit && !chosen && (
                    <form action={optionStatusAction}>
                      <HiddenIds tripId={tripId} section={section} optionId={o.id} /><input type="hidden" name="status" value="selected" />
                      <SubmitButton className={btn}>Select</SubmitButton>
                    </form>
                  )}
                  {canEdit && o.status === 'selected' && (
                    <form action={optionStatusAction} className="flex gap-1">
                      <HiddenIds tripId={tripId} section={section} optionId={o.id} /><input type="hidden" name="status" value="booked" />
                      <input name="bookingRef" placeholder="Confirmation # (optional)" aria-label="Confirmation number" className={`${inp} w-44`} />
                      <SubmitButton className={btn}>Mark booked</SubmitButton>
                    </form>
                  )}
                  {o.bookingUrl && (
                    <a href={o.bookingUrl} target="_blank" rel="noopener noreferrer" className={`${btn2} inline-flex items-center gap-1`}>
                      {o.kind === 'activity' ? 'Website' : 'Book'} <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  )}
                  {canEdit && (
                    <form action={deleteOptionAction}>
                      <HiddenIds tripId={tripId} section={section} optionId={o.id} />
                      <SubmitButton className={btn2} title="Remove from shortlist">
                        <Trash2 aria-hidden className="h-3.5 w-3.5" />Remove
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
              {(ups.length > 0 || downs.length > 0) && (
                <p className="mt-1 text-xs text-neutral-500">
                  Votes: {o.votes.voters.map((v) => `${v.name} ${v.value === 1 ? '+1' : '−1'}`).join(', ')}
                </p>
              )}
              {o.comments.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {o.comments.map((c) => (
                    <li key={c.id} className="text-xs"><span className="font-medium">{c.author}:</span> {c.body}</li>
                  ))}
                </ul>
              )}
              <form action={cAction} className="mt-2 flex gap-2">
                <HiddenIds tripId={tripId} section={section} optionId={o.id} />
                <input name="body" placeholder="Add a comment for the group…" aria-label="Option comment" className={`${inp} flex-1`} />
                <SubmitButton className={btn2}>Post</SubmitButton>
              </form>
              {cState.error && <p className="text-xs text-red-600">{cState.error}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

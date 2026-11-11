'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { ExternalLink, RefreshCw, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import {
  deleteOptionAction, optionCommentAction, optionStatusAction, restoreOptionAction, voteAction,
} from '@/lib/actions/options';
import { refreshPricesAction } from '@/lib/actions/price-watch';
import type { ActionState } from '@/lib/actions/people';
import { SubmitButton } from '@/components/submit-button';
import { CompareToggle, CompareTray } from '@/components/compare-tray';
import { MarkBookedControl } from '@/components/mark-booked';
import { useToast } from '@/components/toaster';
import { priceDelta } from '@/lib/domain/price-watch';
import { money, timeAgo } from '@/lib/ui-format';

export type PriceCheck = {
  checkedAt: string;
  /** null = still listed but currently unpriced. */
  priceCents: number | null;
  currency: string | null;
  /** false = no longer listed. */
  available: boolean;
};

export type ShortlistedOption = {
  id: string; title: string; subtitle: string | null; status: string;
  price: number | null; currency: string | null; bookingUrl: string | null;
  bookingRef: string | null; source: string; externalId?: string | null;
  kind?: string;
  /** Slimmed trip_options.data — powers the compare sheet. */
  data?: unknown;
  /** Latest Price Watch row; null when never checked. */
  priceCheck?: PriceCheck | null;
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

function optionIdsForm(tripId: string, section: string, optionId: string): FormData {
  const fd = new FormData();
  fd.set('tripId', tripId);
  fd.set('section', section);
  fd.set('optionId', optionId);
  return fd;
}

/**
 * Bin instead of delete: the card leaves the list, a toast offers Undo, and
 * the row lands in "Recently removed" on the Shortlist tab.
 */
function RemoveOptionButton({ tripId, section, optionId, title }: {
  tripId: string; section: string; optionId: string; title: string;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={btn2}
      disabled={pending}
      title="Remove from shortlist (keeps votes and comments — undoable)"
      onClick={async () => {
        setPending(true);
        try {
          await deleteOptionAction(optionIdsForm(tripId, section, optionId));
          toast.push(`Removed ${title}`, {
            actionLabel: 'Undo',
            onAction: () => {
              void restoreOptionAction(optionIdsForm(tripId, section, optionId));
            },
          });
        } catch {
          toast.push(`Could not remove ${title} — please try again.`);
        } finally {
          setPending(false);
        }
      }}
    >
      <Trash2 aria-hidden className="h-3.5 w-3.5" />Remove
    </button>
  );
}

/**
 * Price Watch line under a flight option's frozen price: the delta vs the
 * shortlist baseline when the currencies match, "no longer listed" when it
 * vanished from the results, and when the last check ran.
 */
function PriceWatchLine({ o }: { o: ShortlistedOption }) {
  const c = o.priceCheck!;
  const chip = (cls: string, text: string, title?: string) => (
    <span className={`rounded px-1.5 py-0.5 font-medium ${cls}`} title={title}>{text}</span>
  );
  let verdict: ReactNode = null;
  if (!c.available) {
    verdict = chip('bg-amber-50 text-amber-800', 'no longer listed');
  } else if (c.priceCents === null) {
    verdict = chip('bg-neutral-100 text-neutral-400', '—', 'Still listed, but no current price');
  } else {
    const cur = c.currency ?? 'USD';
    const nowPrice = money(c.priceCents / 100, cur);
    const baselineCents = o.price !== null ? Math.round(o.price * 100) : null;
    const sameCur = baselineCents !== null && (o.currency ?? 'USD') === cur;
    if (sameCur) {
      const d = priceDelta(baselineCents, c.priceCents);
      if (d.pct === null || Math.abs(d.pct) < 0.05) {
        verdict = chip('bg-neutral-100 text-neutral-600', '±0%', `Unchanged at ${nowPrice}`);
      } else if (d.pct < 0) {
        verdict = chip(
          'bg-teal-50 text-teal-700', `−${Math.abs(d.pct).toFixed(1)}%`,
          `Dropped to ${nowPrice} — was ${money(baselineCents / 100, cur)} when shortlisted`,
        );
      } else {
        verdict = chip(
          'bg-amber-50 text-amber-800', `+${d.pct.toFixed(1)}%`,
          `Up to ${nowPrice} — was ${money(baselineCents / 100, cur)} when shortlisted`,
        );
      }
    } else {
      verdict = chip(
        'bg-neutral-100 text-neutral-700', `now ${nowPrice}`,
        baselineCents === null
          ? 'No baseline price was recorded when shortlisted'
          : 'Provider quotes a different currency — compare at booking',
      );
    }
  }
  return (
    <span className="mt-0.5 flex items-center justify-end gap-1.5 text-xs">
      {verdict}
      <span className="text-neutral-400">checked {timeAgo(c.checkedAt)}</span>
    </span>
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
  const [pwState, pwAction] = useActionState<ActionState, FormData>(refreshPricesAction, {});
  if (!options.length) return null;
  const watchable = options.some((o) => o.kind === 'flight' && o.source === 'google_flights');
  return (
    <CompareTray tripId={tripId} section={section} canEdit={canEdit} options={options}>
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {canEdit && watchable && (
          <form action={pwAction}>
            <input type="hidden" name="tripId" value={tripId} />
            <SubmitButton className={btn2} title="Re-check current prices for shortlisted Google Flights">
              <RefreshCw aria-hidden className="h-3 w-3" />Check prices
            </SubmitButton>
          </form>
        )}
      </div>
      {pwState.error && <p role="alert" className="mt-1 text-xs text-red-600">{pwState.error}</p>}
      <p className="mb-3 text-xs text-neutral-500">
        Vote and comment together, then Select the one you want — it feeds the budget and itinerary.
        {options.length > 1 && ' Tick Compare on 2–3 cards to see them side by side.'}
      </p>
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
                  {options.length > 1 && <CompareToggle optionId={o.id} />}
                  {(o.price !== null || o.priceCheck) && (
                    <span className="mr-1 text-right">
                      {o.price !== null && (
                        <span className="block text-sm font-semibold">{money(o.price, o.currency ?? 'USD')}</span>
                      )}
                      {o.priceCheck && <PriceWatchLine o={o} />}
                    </span>
                  )}
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
                    <MarkBookedControl
                      tripId={tripId} section={section} optionId={o.id}
                      price={o.price} currency={o.currency}
                    />
                  )}
                  {o.bookingUrl && (
                    <a href={o.bookingUrl} target="_blank" rel="noopener noreferrer" className={`${btn2} inline-flex items-center gap-1`}>
                      {o.kind === 'activity' ? 'Website' : 'Book'} <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  )}
                  {canEdit && (
                    <RemoveOptionButton tripId={tripId} section={section} optionId={o.id} title={o.title} />
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
    </CompareTray>
  );
}

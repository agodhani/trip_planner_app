'use client';

import {
  createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { Check, ExternalLink, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { optionStatusAction, voteAction } from '@/lib/actions/options';
import { buildCompare } from '@/lib/domain/compare';
import { SubmitButton } from '@/components/submit-button';

/** The fields the tray needs — ShortlistedOption is structurally assignable. */
export type CompareListOption = {
  id: string; title: string; subtitle: string | null; status: string;
  price: number | null; currency: string | null; bookingUrl: string | null;
  kind?: string; data?: unknown;
  votes: { score: number; voters: { name: string; value: number }[] };
};

type Section = 'flights' | 'stay' | 'activities' | 'transport' | 'itinerary' | 'budget' | 'log' | 'shortlist';

const MAX_PICK = 3;
const KIND_NOUN: Record<string, [string, string]> = {
  flight: ['flight', 'flights'],
  lodging: ['stay', 'stays'],
  activity: ['activity', 'activities'],
  transport: ['transport option', 'transport options'],
  other: ['option', 'options'],
};

const btn = 'rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';
const btn2 = 'inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const chip = 'rounded bg-neutral-100 px-1.5 text-xs';

type CompareCtx = {
  isSelected: (id: string) => boolean;
  canPick: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Why a disabled box can't be ticked right now. */
  hint: string | null;
};

const Ctx = createContext<CompareCtx | null>(null);

/** Per-card checkbox; renders only inside a CompareTray. */
export function CompareToggle({ optionId }: { optionId: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const checked = ctx.isSelected(optionId);
  const disabled = !checked && !ctx.canPick(optionId);
  return (
    <label
      className={`flex items-center gap-1 text-xs ${disabled ? 'text-neutral-400' : 'cursor-pointer text-neutral-600 hover:text-neutral-800'}`}
      title={disabled ? ctx.hint ?? undefined : 'Compare side by side'}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => ctx.toggle(optionId)}
        className="accent-teal-600"
      />
      Compare
    </label>
  );
}

function hiddenIds(tripId: string, section: string, optionId: string) {
  return (
    <>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="optionId" value={optionId} />
    </>
  );
}

/**
 * Wraps a shortlist section: owns the compare selection, renders a sticky bar
 * once anything is ticked, and a sheet with the per-kind attribute table.
 * Decision controls reuse the same server actions as the cards so votes and
 * status stay consistent.
 */
export function CompareTray({
  tripId, section, canEdit, options, children,
}: {
  tripId: string;
  section: Section;
  canEdit: boolean;
  options: CompareListOption[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const selectedOptions = selected
    .map((id) => byId.get(id))
    .filter((o): o is CompareListOption => !!o);
  const kind = selectedOptions[0]?.kind ?? options[0]?.kind ?? 'other';
  const [one, many] = KIND_NOUN[kind] ?? KIND_NOUN.other;

  const isSelected = (id: string) => selected.includes(id);
  const canPick = (id: string) => {
    if (selected.includes(id)) return true;
    if (selected.length >= MAX_PICK) return false;
    const first = selectedOptions[0];
    const opt = byId.get(id);
    if (first?.kind && opt?.kind && first.kind !== opt.kind) return false;
    return true;
  };
  const hint = selected.length >= MAX_PICK
    ? `Compare up to ${MAX_PICK} — uncheck one to pick another.`
    : 'Compare works within one kind — uncheck to switch.';

  const toggle = (id: string) => {
    if (!isSelected(id) && !canPick(id)) return;
    const next = isSelected(id) ? selected.filter((x) => x !== id) : [...selected, id];
    if (!next.length) setOpen(false);
    setSelected(next);
  };
  const clear = () => { setSelected([]); setOpen(false); };

  const rows = useMemo(
    () => (open ? buildCompare(kind, selectedOptions) : []),
    [open, kind, selectedOptions],
  );

  // Escape closes; the page stays put while the sheet is open.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const ctx: CompareCtx = { isSelected, canPick, toggle, hint };
  const noun = selected.length === 1 ? one : many;

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {selected.length > 0 && (
        <div className="sticky bottom-3 z-30 mt-4 flex justify-center">
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 shadow-lg">
            <span className="text-xs text-neutral-600">
              {selected.length} selected{selected.length < 2 ? ' — pick at least 2' : ''}
            </span>
            <button
              type="button" className={btn} disabled={selected.length < 2}
              onClick={() => setOpen(true)}
              title={selected.length < 2 ? 'Pick at least 2 to compare' : undefined}
            >
              Compare {selected.length} {noun} →
            </button>
            <button type="button" className="text-xs text-neutral-500 hover:text-neutral-800" onClick={clear}>
              Clear
            </button>
          </div>
        </div>
      )}
      {open && selectedOptions.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog" aria-modal="true" aria-label={`Compare ${many}`}
        >
          <button
            type="button" aria-label="Close compare"
            className="absolute inset-0 h-full w-full cursor-default bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            data-testid="compare-sheet"
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
              <div>
                <h2 className="font-semibold">Compare {many}</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  The best value in each comparable row is highlighted — &apos;—&apos; means that option didn&apos;t report it.
                </p>
              </div>
              <button
                ref={closeRef} type="button" onClick={() => setOpen(false)}
                className={btn2} aria-label="Close compare"
              >
                <X aria-hidden className="h-4 w-4" />
                Close
              </button>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left">
                    <th className="w-32 px-2 py-2"><span className="sr-only">Attribute</span></th>
                    {selectedOptions.map((o) => (
                      <th key={o.id} className="min-w-44 max-w-64 px-2 py-2 align-top">
                        <p className="text-sm font-medium text-neutral-900">{o.title}</p>
                        {o.subtitle && <p className="mt-0.5 text-xs font-normal text-neutral-500">{o.subtitle}</p>}
                        <span className={`mt-1 inline-block ${chip} ${o.status === 'selected' || o.status === 'booked' ? 'bg-teal-100 text-teal-800' : ''}`}>
                          {o.status}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-b border-neutral-100">
                      <th className="px-2 py-2 text-left align-top text-xs font-medium uppercase tracking-wide text-neutral-500">
                        {r.label}
                      </th>
                      {r.cells.map((c, i) => (
                        <td
                          key={i}
                          data-best={c.best ? 'true' : undefined}
                          className={`px-2 py-2 align-top ${c.best ? 'bg-teal-50 font-medium text-teal-900' : 'text-neutral-700'}`}
                        >
                          {c.best && (
                            <>
                              <Check aria-hidden className="mr-1 inline h-3.5 w-3.5 text-teal-600" />
                              <span className="sr-only">Best: </span>
                            </>
                          )}
                          {c.text}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th className="px-2 py-3 text-left align-top text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Decide
                    </th>
                    {selectedOptions.map((o) => {
                      const ups = o.votes.voters.filter((v) => v.value === 1);
                      const downs = o.votes.voters.filter((v) => v.value === -1);
                      const chosen = o.status === 'selected' || o.status === 'booked';
                      return (
                        <td key={o.id} className="px-2 py-3 align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <form action={voteAction}>
                              {hiddenIds(tripId, section, o.id)}
                              <input type="hidden" name="value" value="1" />
                              <SubmitButton
                                className={btn2} aria-label="Vote up"
                                title={ups.length ? `Up: ${ups.map((v) => v.name).join(', ')}` : 'Vote up'}
                              >
                                <ThumbsUp aria-hidden className="h-3.5 w-3.5" />{ups.length}
                              </SubmitButton>
                            </form>
                            <form action={voteAction}>
                              {hiddenIds(tripId, section, o.id)}
                              <input type="hidden" name="value" value="-1" />
                              <SubmitButton
                                className={btn2} aria-label="Vote down"
                                title={downs.length ? `Down: ${downs.map((v) => v.name).join(', ')}` : 'Vote down'}
                              >
                                <ThumbsDown aria-hidden className="h-3.5 w-3.5" />{downs.length}
                              </SubmitButton>
                            </form>
                            {canEdit && !chosen && (
                              <form action={optionStatusAction}>
                                {hiddenIds(tripId, section, o.id)}
                                <input type="hidden" name="status" value="selected" />
                                <SubmitButton className={btn}>Select</SubmitButton>
                              </form>
                            )}
                            {o.bookingUrl && (
                              <a href={o.bookingUrl} target="_blank" rel="noopener noreferrer" className={btn2}>
                                {o.kind === 'activity' ? 'Website' : 'Book'}
                                <ExternalLink aria-hidden className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

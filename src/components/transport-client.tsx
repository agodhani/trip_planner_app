'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Bike, Car, Check, ExternalLink, Footprints, Route, TramFront, type LucideIcon } from 'lucide-react';
import { chooseLegAction, computeLegsAction, manualLegAction } from '@/lib/actions/itinerary';
import type { ActionState } from '@/lib/actions/people';
import { ui } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import { dayLabel, money } from '@/lib/ui-format';

const { btn, btn2, card, inp } = ui;
const lbl = 'flex flex-col gap-1 text-xs font-medium text-neutral-600';

type Leg = {
  id: string; mode: string; source: string; durationMin: number | null;
  distanceM: number | null; summary: string | null; deepLink: string | null;
  chosen: boolean; cost: number | null; costCurrency: string | null;
  fromItemId: string; toItemId: string;
};
type Group = { fromTitle: string; toTitle: string; day: string | null; legs: Leg[] };
type Pair = { fromItemId: string; toItemId: string; day: string; label: string };

const MODE: Record<string, { icon: LucideIcon; label: string }> = {
  walk: { icon: Footprints, label: 'Walk' },
  drive: { icon: Car, label: 'Drive' },
  transit: { icon: TramFront, label: 'Transit' },
  bike: { icon: Bike, label: 'Bike' },
  other: { icon: Route, label: 'Other' },
};
const SOURCE: Record<string, string> = {
  osrm: 'OSRM', fossgis: 'FOSSGIS', transitous: 'Transitous', manual: 'added manually',
};

export function TransportClient({ tripId, canEdit, currency, days, groups, pairs }: {
  tripId: string; canEdit: boolean; currency: string; days: string[];
  groups: Group[]; pairs: Pair[];
}) {
  const [mState, mAction] = useActionState<ActionState, FormData>(manualLegAction, {});
  const [pairIdx, setPairIdx] = useState(0);
  const pair = pairs[Math.min(pairIdx, pairs.length - 1)];
  const dayName = (d: string | null) => {
    if (!d) return '';
    const i = days.indexOf(d);
    return i >= 0 ? `Day ${i + 1} · ${dayLabel(d)}` : dayLabel(d);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-800">Routes between consecutive stops on each day</p>
            <p className="text-xs text-neutral-500">
              Compares walking (FOSSGIS), driving (OSRM), and public transit (Transitous). Walks under 20 minutes are picked by default.
            </p>
          </div>
          {canEdit && (
            <form action={computeLegsAction}>
              <input type="hidden" name="tripId" value={tripId} />
              <SubmitButton className={btn}>Compute routes</SubmitButton>
            </form>
          )}
        </div>
      </section>

      {groups.length === 0 && (
        <section className={card}>
          <p className="text-sm text-neutral-500">
            No legs yet — schedule two or more items with locations on the same day, then Compute routes.{' '}
            <Link href={`/trips/${tripId}/itinerary`} className="font-medium text-teal-700 underline">Open the itinerary</Link>
          </p>
        </section>
      )}

      {groups.map((g, gi) => (
        <section key={gi} className={card}>
          <h2 className="mb-2 font-semibold">
            {g.fromTitle} → {g.toTitle}
            {g.day ? <span className="ml-2 text-xs font-normal text-neutral-500">{dayName(g.day)}</span> : null}
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {g.legs.map((l) => {
              const m = MODE[l.mode] ?? MODE.other;
              const Icon = m.icon;
              return (
                <div key={l.id} className={`rounded-lg border p-3 text-sm ${l.chosen ? 'border-teal-500 bg-teal-50/50' : 'border-neutral-200'}`}>
                  <p className="flex items-center gap-1.5 font-medium">
                    <Icon aria-hidden className="h-4 w-4 text-neutral-600" />
                    {m.label}
                    {l.durationMin != null && <span className="font-semibold">· {l.durationMin} min</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {[
                      l.distanceM != null ? `${(l.distanceM / 1000).toFixed(1)} km` : null,
                      l.source === 'manual' || l.mode === 'transit' ? l.summary : null,
                      l.cost != null ? money(l.cost, l.costCurrency ?? currency, 2) : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs text-neutral-400">via {SOURCE[l.source] ?? l.source}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {canEdit && !l.chosen && (
                      <form action={chooseLegAction}>
                        <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="legId" value={l.id} />
                        <SubmitButton className={btn2}>Use this</SubmitButton>
                      </form>
                    )}
                    {l.chosen && (
                      <span className="inline-flex items-center gap-1 rounded bg-teal-100 px-1.5 py-1 text-xs font-medium text-teal-700">
                        <Check aria-hidden className="h-3 w-3" />chosen
                      </span>
                    )}
                    {l.deepLink && (
                      <a href={l.deepLink} target="_blank" rel="noopener noreferrer" className={`${btn2} inline-flex items-center gap-1`}>
                        Directions <ExternalLink aria-hidden className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {canEdit && pairs.length > 0 && pair && (
        <section className={card}>
          <h2 className="font-semibold">Add your own leg</h2>
          <p className="mb-3 text-xs text-neutral-500">Taxi, rental car, ferry, a friend driving — it replaces any computed route of the same mode and gets picked for that hop.</p>
          <form action={mAction} className="flex flex-wrap items-end gap-3 text-sm">
            <input type="hidden" name="tripId" value={tripId} />
            <input type="hidden" name="fromItemId" value={pair.fromItemId} />
            <input type="hidden" name="toItemId" value={pair.toItemId} />
            <input type="hidden" name="currency" value={currency} />
            <label className={`${lbl} min-w-60 flex-1`}>Between
              <select value={pairIdx} onChange={(e) => setPairIdx(Number(e.target.value))} className={inp}>
                {pairs.map((p, i) => <option key={`${p.fromItemId}|${p.toItemId}`} value={i}>{dayName(p.day)}: {p.label}</option>)}
              </select>
            </label>
            <label className={lbl}>Mode
              <select name="mode" className={inp}>
                <option value="drive">Drive</option><option value="transit">Transit</option>
                <option value="walk">Walk</option><option value="bike">Bike</option><option value="other">Other</option>
              </select>
            </label>
            <label className={lbl}>Description<input name="summary" placeholder="e.g. Rental car" required className={`${inp} w-40`} /></label>
            <label className={lbl}>Minutes<input name="durationMin" placeholder="min" type="number" min="1" className={`${inp} w-20`} /></label>
            <label className={lbl}>Cost ({currency})<input name="cost" placeholder={`cost ${currency}`} type="number" step="0.01" min="0" className={`${inp} w-24`} /></label>
            <SubmitButton className={btn}>Add leg</SubmitButton>
            {mState.error && <p role="alert" className="w-full text-sm text-red-600">{mState.error}</p>}
          </form>
        </section>
      )}
    </div>
  );
}

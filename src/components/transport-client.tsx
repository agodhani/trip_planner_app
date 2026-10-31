'use client';

import { useActionState } from 'react';
import { chooseLegAction, computeLegsAction, manualLegAction } from '@/lib/actions/itinerary';
import type { ActionState } from '@/lib/actions/people';
import { ui } from '@/components/shortlisted-options';

const { btn, btn2, card, inp } = ui;

type Leg = {
  id: string; mode: string; source: string; durationMin: number | null;
  distanceM: number | null; summary: string | null; deepLink: string | null;
  chosen: boolean; cost: number | null; costCurrency: string | null;
  fromItemId: string; toItemId: string;
};
type Group = { fromTitle: string; toTitle: string; day: string | null; legs: Leg[] };

export function TransportClient({ tripId, canEdit, currency, groups, pairs }: {
  tripId: string; canEdit: boolean; currency: string;
  groups: Group[]; pairs: { fromItemId: string; toItemId: string; label: string }[];
}) {
  const [mState, mAction] = useActionState<ActionState, FormData>(manualLegAction, {});
  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-neutral-600">
            Route estimates between consecutive itinerary items (walk via FOSSGIS, drive via OSRM, transit via Transitous).
          </p>
          <span className="flex-1" />
          {canEdit && (
            <form action={computeLegsAction}>
              <input type="hidden" name="tripId" value={tripId} />
              <button className={btn} type="submit">Compute routes</button>
            </form>
          )}
        </div>
      </section>

      {groups.length === 0 && (
        <section className={card}>
          <p className="text-sm text-neutral-500">
            No legs yet — schedule two or more items with locations on the same day, then Compute routes.
          </p>
        </section>
      )}

      {groups.map((g, gi) => (
        <section key={gi} className={card}>
          <h2 className="mb-2 font-semibold">{g.fromTitle} → {g.toTitle}{g.day ? <span className="ml-2 text-xs font-normal text-neutral-500">{g.day}</span> : null}</h2>
          <div className="flex flex-wrap gap-2">
            {g.legs.map((l) => (
              <div key={l.id} className={`rounded-lg border p-3 text-sm ${l.chosen ? 'border-teal-500 bg-teal-50/50' : 'border-neutral-200'}`}>
                <p className="font-medium capitalize">{l.mode}
                  {l.durationMin != null && ` · ${l.durationMin} min`}
                  {l.distanceM != null && ` · ${(l.distanceM / 1000).toFixed(1)} km`}
                </p>
                <p className="text-xs text-neutral-500">
                  {l.source}{l.summary ? ` · ${l.summary}` : ''}
                  {l.cost != null && ` · ${l.costCurrency ?? currency} ${l.cost}`}
                </p>
                <div className="mt-1.5 flex gap-1">
                  {canEdit && !l.chosen && (
                    <form action={chooseLegAction}>
                      <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="legId" value={l.id} />
                      <button className={btn2} type="submit">Use this</button>
                    </form>
                  )}
                  {l.chosen && <span className="rounded bg-teal-100 px-1.5 py-1 text-xs text-teal-700">chosen</span>}
                  {l.deepLink && <a href={l.deepLink} target="_blank" rel="noopener noreferrer" className={btn2}>Directions</a>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {canEdit && pairs.length > 0 && (
        <section className={card}>
          <h2 className="mb-2 font-semibold">Manual leg</h2>
          <form action={mAction} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="tripId" value={tripId} />
            <label>From
              <select name="fromItemId" className={`${inp} ml-1`}>
                {pairs.map((p) => <option key={p.fromItemId} value={p.fromItemId}>{p.label.split(' → ')[0]}</option>)}
              </select>
            </label>
            <label>To
              <select name="toItemId" className={`${inp} ml-1`}>
                {pairs.map((p) => <option key={p.toItemId} value={p.toItemId}>{p.label.split(' → ')[1]}</option>)}
              </select>
            </label>
            <label>Mode
              <select name="mode" className={`${inp} ml-1`}>
                <option value="drive">drive</option><option value="transit">transit</option>
                <option value="walk">walk</option><option value="bike">bike</option><option value="other">other</option>
              </select>
            </label>
            <input name="summary" placeholder="e.g. Rental car" required className={`${inp} w-40`} />
            <input name="durationMin" placeholder="min" type="number" className={`${inp} w-16`} />
            <input name="cost" placeholder={`cost ${currency}`} type="number" step="0.01" className={`${inp} w-24`} />
            <button className={btn} type="submit">Add leg</button>
            {mState.error && <p role="alert" className="text-sm text-red-600">{mState.error}</p>}
          </form>
        </section>
      )}
    </div>
  );
}

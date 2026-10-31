'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  addItemAction, autoArrangeAction, deleteItemAction, moveItemAction,
  syncAnchorsAction, updateItemAction,
} from '@/lib/actions/itinerary';
import type { ActionState } from '@/lib/actions/people';
import { ui, HiddenIds } from '@/components/shortlisted-options';

const { btn, btn2, card, inp } = ui;

type Item = {
  id: string; day: string | null; kind: string; title: string;
  startTime: string | null; endTime: string | null; sortOrder: number;
  locked: boolean; system: boolean; unplanned: boolean;
  notes: string | null; plannedCost: number | null;
  lat: number | null; lon: number | null;
};
type Leg = { id: string; fromItemId: string; toItemId: string; mode: string; durationMin: number | null; summary: string | null; deepLink: string | null; chosen: boolean };

const KIND_ICON: Record<string, string> = {
  flight_depart: 'Fly', flight_arrive: 'Land', checkin: 'In', checkout: 'Out',
  activity: 'Do', meal: 'Eat', transport: 'Go', custom: 'Note',
};

function ItemCard({ it, canEdit, tripId, days }: { it: Item; canEdit: boolean; tripId: string; days: string[] }) {
  return (
    <div className={`rounded-lg border p-2.5 text-sm ${it.system ? 'border-teal-200 bg-teal-50/50' : 'border-neutral-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            <span className="mr-1.5 rounded bg-neutral-100 px-1 text-xs text-neutral-600">{KIND_ICON[it.kind] ?? it.kind}</span>
            {it.title}
            {it.locked && <span className="ml-1 text-xs text-neutral-400">locked</span>}
          </p>
          <p className="text-xs text-neutral-500">
            {it.startTime ?? '—'}{it.endTime ? `–${it.endTime}` : ''}
            {it.plannedCost != null && ` · ${it.plannedCost}`}
            {it.notes && ` · ${it.notes}`}
          </p>
        </div>
        {canEdit && !it.system && (
          <span className="flex shrink-0 gap-1">
            <form action={updateItemAction}>
              <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={it.id} />
              <input type="hidden" name="locked" value={it.locked ? '0' : '1'} />
              <button className={btn2} type="submit">{it.locked ? 'Unlock' : 'Lock'}</button>
            </form>
            <form action={moveItemAction}>
              <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={it.id} />
              <select name="day" aria-label="Move to day" defaultValue={it.day ?? 'pool'} className={`${inp} text-xs`} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                <option value="pool">Pool</option>
                {days.map((d) => <option key={d} value={d}>{d.slice(5)}</option>)}
              </select>
            </form>
            <form action={deleteItemAction}>
              <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={it.id} />
              <button className={btn2} type="submit">×</button>
            </form>
          </span>
        )}
      </div>
      {canEdit && !it.system && (
        <form action={updateItemAction} className="mt-1.5 flex gap-1.5 text-xs">
          <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={it.id} />
          <input name="startTime" defaultValue={it.startTime ?? ''} placeholder="09:00" className={`${inp} w-16`} />
          <input name="endTime" defaultValue={it.endTime ?? ''} placeholder="11:00" className={`${inp} w-16`} />
          <input name="plannedCost" defaultValue={it.plannedCost ?? ''} placeholder="cost" className={`${inp} w-16`} />
          <input name="notes" defaultValue={it.notes ?? ''} placeholder="note" className={`${inp} flex-1`} />
          <button className={btn2} type="submit">Save</button>
        </form>
      )}
    </div>
  );
}

export function ItineraryClient({ tripId, canEdit, days, items, legs, pool }: {
  tripId: string; canEdit: boolean; days: string[];
  items: Item[]; legs: Leg[]; pool: { id: string; title: string; lat: number | null; lon: number | null }[];
}) {
  const router = useRouter();
  const synced = useRef(false);
  const [aState, aAction] = useActionState<ActionState, FormData>(addItemAction, {});

  useEffect(() => {
    if (synced.current || !canEdit) return;
    synced.current = true;
    const fd = new FormData(); fd.set('tripId', tripId);
    void syncAnchorsAction(fd).then(() => router.refresh());
  }, [tripId, canEdit, router]);

  const byDay = new Map<string, Item[]>();
  const poolItems = items.filter((i) => i.unplanned || !i.day);
  for (const i of items) {
    if (i.unplanned || !i.day) continue;
    byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]);
  }
  for (const arr of byDay.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  const legBetween = (a: Item, b: Item) => legs.find((l) => l.fromItemId === a.id && l.toItemId === b.id && l.chosen)
    ?? legs.find((l) => l.fromItemId === a.id && l.toItemId === b.id);

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-neutral-600">
            {days.length ? `${days.length} days · ${days[0]} → ${days[days.length - 1]}` : 'No dates yet — select a flight or set trip dates.'}
          </p>
          <span className="flex-1" />
          {canEdit && (
            <>
              <form action={autoArrangeAction}>
                <input type="hidden" name="tripId" value={tripId} />
                <button className={btn2} type="submit">Auto-arrange pool</button>
              </form>
              <button className={btn2} type="button" onClick={() => window.print()}>Print</button>
            </>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          {days.map((d) => (
            <section key={d} className={card}>
              <h2 className="mb-2 font-semibold">{d}</h2>
              <div className="flex flex-col gap-2">
                {(byDay.get(d) ?? []).map((it, i, arr) => (
                  <div key={it.id}>
                    <ItemCard it={it} canEdit={canEdit} tripId={tripId} days={days} />
                    {i < arr.length - 1 && (() => {
                      const leg = legBetween(it, arr[i + 1]);
                      return leg ? (
                        <p className="mx-3 border-l-2 border-dashed border-neutral-300 py-1 pl-3 text-xs text-neutral-500">
                          {leg.mode}{leg.durationMin != null ? ` · ${leg.durationMin} min` : ''}{leg.summary ? ` · ${leg.summary}` : ''}
                          {leg.deepLink && <> · <a href={leg.deepLink} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">directions</a></>}
                        </p>
                      ) : null;
                    })()}
                  </div>
                ))}
                {(byDay.get(d) ?? []).length === 0 && <p className="text-xs text-neutral-400">Nothing scheduled.</p>}
              </div>
            </section>
          ))}
        </div>

        <aside className="flex flex-col gap-4">
          <section className={card}>
            <h2 className="mb-2 font-semibold">Pool</h2>
            <div className="flex flex-col gap-2">
              {poolItems.map((it) => (
                <ItemCard key={it.id} it={it} canEdit={canEdit} tripId={tripId} days={days} />
              ))}
              {poolItems.length === 0 && <p className="text-xs text-neutral-400">Pool is empty.</p>}
            </div>
          </section>
          {canEdit && pool.length > 0 && (
            <section className={card}>
              <h2 className="mb-2 font-semibold">Shortlisted activities</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {pool.map((o) => (
                  <li key={o.id}>
                    <form action={aAction} className="flex items-center gap-2">
                      <HiddenIds tripId={tripId} section="itinerary" optionId={o.id} />
                      <input type="hidden" name="kind" value="activity" /><input type="hidden" name="title" value={o.title} />
                      {o.lat != null && <><input type="hidden" name="lat" value={o.lat} /><input type="hidden" name="lon" value={o.lon ?? 0} /></>}
                      <span className="flex-1 truncate">{o.title}</span>
                      <select name="day" className={`${inp} text-xs`} required>
                        <option value="">pool</option>
                        {days.map((d) => <option key={d} value={d}>{d.slice(5)}</option>)}
                      </select>
                      <button className={btn2} type="submit">Add</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {canEdit && (
            <section className={card}>
              <h2 className="mb-2 font-semibold">Custom item</h2>
              <form action={aAction} className="flex flex-col gap-2 text-sm">
                <input type="hidden" name="tripId" value={tripId} />
                <input name="title" placeholder="Title" required className={inp} />
                <div className="flex gap-2">
                  <select name="kind" className={inp}><option value="activity">activity</option><option value="meal">meal</option><option value="transport">transport</option><option value="custom">custom</option></select>
                  <select name="day" className={inp}><option value="">pool</option>{days.map((d) => <option key={d} value={d}>{d.slice(5)}</option>)}</select>
                </div>
                <input name="notes" placeholder="Notes" className={inp} />
                <button className={btn} type="submit">Add item</button>
                {aState.error && <p className="text-xs text-red-600">{aState.error}</p>}
              </form>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

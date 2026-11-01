'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BedDouble, Bus, Footprints, Lock, LockOpen, LogOut, MapPin, Pencil, Plane, PlaneLanding,
  Printer, Sparkles, StickyNote, Trash2, Utensils, type LucideIcon,
} from 'lucide-react';
import {
  addItemAction, autoArrangeAction, deleteItemAction, moveItemAction,
  syncAnchorsAction, updateItemAction,
} from '@/lib/actions/itinerary';
import type { ActionState } from '@/lib/actions/people';
import { ui, HiddenIds } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import { orderDay } from '@/lib/domain/itinerary';
import { dayLabel, plural } from '@/lib/ui-format';

const { btn, btn2, card, inp } = ui;
const iconBtn = 'rounded-md border border-neutral-200 p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800';

type Item = {
  id: string; day: string | null; kind: string; title: string;
  startTime: string | null; endTime: string | null; sortOrder: number;
  locked: boolean; system: boolean; unplanned: boolean;
  notes: string | null; plannedCost: number | null;
  lat: number | null; lon: number | null;
};
type Leg = { id: string; fromItemId: string; toItemId: string; mode: string; durationMin: number | null; summary: string | null; deepLink: string | null; chosen: boolean };

const KIND: Record<string, { icon: LucideIcon; label: string }> = {
  flight_depart: { icon: Plane, label: 'Flight' },
  flight_arrive: { icon: PlaneLanding, label: 'Arrival' },
  checkin: { icon: BedDouble, label: 'Check-in' },
  checkout: { icon: LogOut, label: 'Check-out' },
  activity: { icon: MapPin, label: 'Activity' },
  meal: { icon: Utensils, label: 'Meal' },
  transport: { icon: Bus, label: 'Transport' },
  custom: { icon: StickyNote, label: 'Note' },
};

function ItemCard({ it, canEdit, tripId, days, currency }: { it: Item; canEdit: boolean; tripId: string; days: string[]; currency: string }) {
  const [editing, setEditing] = useState(false);
  const k = KIND[it.kind] ?? KIND.custom;
  const Icon = k.icon;
  const hm = (v: string | null) => v?.slice(0, 5) ?? '';
  const when = it.kind === 'checkin' ? 'from ' : it.kind === 'checkout' ? 'by ' : '';
  const meta = [
    it.startTime ? `${when}${hm(it.startTime)}${it.endTime ? `–${hm(it.endTime)}` : ''}` : null,
    it.plannedCost != null ? `${currency} ${it.plannedCost}` : null,
    it.notes,
  ].filter(Boolean).join(' · ');
  return (
    <div className={`rounded-lg border p-2.5 text-sm ${it.system ? 'border-teal-200 bg-teal-50/50' : 'border-neutral-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 basis-40 items-start gap-2">
          <span title={k.label} className={`mt-0.5 rounded p-1 ${it.system ? 'bg-teal-100 text-teal-700' : 'bg-neutral-100 text-neutral-600'}`}>
            <Icon aria-hidden className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">
              {it.title}
              {it.locked && <span className="ml-1.5 text-xs font-normal text-neutral-400">locked</span>}
            </p>
            <p className="text-xs text-neutral-500">
              {meta || (it.system ? 'Added from your selected flight/stay' : canEdit ? 'No time set' : '')}
            </p>
          </div>
        </div>
        {canEdit && !it.system && (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" className={iconBtn} onClick={() => setEditing((v) => !v)} aria-label="Edit details" aria-expanded={editing} title="Edit time, cost, notes">
              <Pencil aria-hidden className="h-3.5 w-3.5" />
            </button>
            <form action={updateItemAction}>
              <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={it.id} />
              <input type="hidden" name="locked" value={it.locked ? '0' : '1'} />
              <button className={iconBtn} type="submit" aria-label={it.locked ? 'Unlock' : 'Lock'} title={it.locked ? 'Unlock — auto-arrange may move it' : 'Lock — auto-arrange keeps it here'}>
                {it.locked ? <Lock aria-hidden className="h-3.5 w-3.5" /> : <LockOpen aria-hidden className="h-3.5 w-3.5" />}
              </button>
            </form>
            <form action={moveItemAction}>
              <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={it.id} />
              <select name="day" aria-label="Move to day" defaultValue={it.day ?? 'pool'} className={`${inp} text-xs`} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                <option value="pool">Unscheduled</option>
                {days.map((d, i) => <option key={d} value={d}>Day {i + 1} · {dayLabel(d)}</option>)}
              </select>
            </form>
            <form action={deleteItemAction}>
              <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={it.id} />
              <button className={iconBtn} type="submit" aria-label="Delete item" title="Delete item">
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </form>
          </span>
        )}
      </div>
      {canEdit && !it.system && editing && (
        <form
          action={async (fd) => { await updateItemAction(fd); setEditing(false); }}
          className="mt-2 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-2 text-xs"
        >
          <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="itemId" value={it.id} />
          <input type="hidden" name="plannedCurrency" value={currency} />
          <label className="flex flex-col gap-0.5 text-neutral-600">Start<input name="startTime" type="time" defaultValue={hm(it.startTime)} className={inp} /></label>
          <label className="flex flex-col gap-0.5 text-neutral-600">End<input name="endTime" type="time" defaultValue={hm(it.endTime)} className={inp} /></label>
          <label className="flex flex-col gap-0.5 text-neutral-600">Cost ({currency})<input name="plannedCost" type="number" min="0" step="0.01" defaultValue={it.plannedCost ?? ''} className={`${inp} w-24`} /></label>
          <label className="flex min-w-40 flex-1 flex-col gap-0.5 text-neutral-600">Notes<input name="notes" defaultValue={it.notes ?? ''} className={inp} /></label>
          <SubmitButton className={btn}>Save</SubmitButton>
          <button type="button" className={btn2} onClick={() => setEditing(false)}>Cancel</button>
        </form>
      )}
    </div>
  );
}

export function ItineraryClient({ tripId, canEdit, days, items, legs, pool, currency }: {
  tripId: string; canEdit: boolean; days: string[]; currency: string;
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
  for (const [d, arr] of byDay) byDay.set(d, orderDay(arr));

  const legBetween = (a: Item, b: Item) => legs.find((l) => l.fromItemId === a.id && l.toItemId === b.id && l.chosen)
    ?? legs.find((l) => l.fromItemId === a.id && l.toItemId === b.id);
  const dayOptions = days.map((d, i) => <option key={d} value={d}>Day {i + 1} · {dayLabel(d)}</option>);

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <p className="text-sm font-medium text-neutral-800">
              {days.length ? `${plural(days.length, 'day')} · ${dayLabel(days[0])} → ${dayLabel(days[days.length - 1])}` : 'No dates yet — select a flight or set trip dates.'}
            </p>
            <p className="text-xs text-neutral-500">
              Flights and your selected stay appear automatically. Add activities from the right, then move them onto days.
            </p>
          </div>
          <span className="flex-1" />
          {canEdit && (
            <form action={autoArrangeAction}>
              <input type="hidden" name="tripId" value={tripId} />
              <SubmitButton className={btn2} disabled={poolItems.length === 0} title="Places unscheduled items on days, grouping nearby spots together">
                <Sparkles aria-hidden className="h-3.5 w-3.5" />Auto-arrange unscheduled
              </SubmitButton>
            </form>
          )}
          <button className={`${btn2} inline-flex items-center gap-1`} type="button" onClick={() => window.print()}>
            <Printer aria-hidden className="h-3.5 w-3.5" />Print
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          {days.map((d, di) => (
            <section key={d} className={card}>
              <h2 className="mb-2 font-semibold">
                <span className="mr-2 text-xs font-medium uppercase tracking-wide text-teal-700">Day {di + 1}</span>{dayLabel(d)}
              </h2>
              <div className="flex flex-col gap-2">
                {(byDay.get(d) ?? []).map((it, i, arr) => (
                  <div key={it.id}>
                    <ItemCard it={it} canEdit={canEdit} tripId={tripId} days={days} currency={currency} />
                    {i < arr.length - 1 && (() => {
                      const leg = legBetween(it, arr[i + 1]);
                      return leg ? (
                        <p className="mx-3 flex items-center gap-1 border-l-2 border-dashed border-neutral-300 py-1 pl-3 text-xs text-neutral-500">
                          <Footprints aria-hidden className="h-3 w-3" />
                          {leg.mode}{leg.durationMin != null ? ` · ${leg.durationMin} min` : ''}{leg.summary ? ` · ${leg.summary}` : ''}
                          {leg.deepLink && <> · <a href={leg.deepLink} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">directions</a></>}
                        </p>
                      ) : null;
                    })()}
                  </div>
                ))}
                {(byDay.get(d) ?? []).length === 0 && (
                  <p className="text-xs text-neutral-400">Nothing planned yet{canEdit ? ' — add an activity from the right.' : '.'}</p>
                )}
              </div>
            </section>
          ))}
        </div>

        <aside className="flex flex-col gap-4">
          {canEdit && pool.length > 0 && (
            <section className={card}>
              <h2 className="font-semibold">Shortlisted activities</h2>
              <p className="mb-2 text-xs text-neutral-500">Pick a day and add — or leave unscheduled and auto-arrange later.</p>
              <ul className="flex flex-col gap-2 text-sm">
                {pool.map((o) => (
                  <li key={o.id}>
                    <form action={aAction} className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 p-2">
                      <HiddenIds tripId={tripId} section="itinerary" optionId={o.id} />
                      <input type="hidden" name="kind" value="activity" /><input type="hidden" name="title" value={o.title} />
                      {o.lat != null && <><input type="hidden" name="lat" value={o.lat} /><input type="hidden" name="lon" value={o.lon ?? 0} /></>}
                      <span className="truncate font-medium" title={o.title}>{o.title}</span>
                      <span className="flex gap-1.5">
                        <select name="day" aria-label={`Day for ${o.title}`} className={`${inp} min-w-0 flex-1 text-xs`} defaultValue="">
                          <option value="">Unscheduled</option>
                          {dayOptions}
                        </select>
                        <SubmitButton className={btn2}>Add</SubmitButton>
                      </span>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className={card}>
            <h2 className="font-semibold">Unscheduled</h2>
            <p className="mb-2 text-xs text-neutral-500">Ideas without a day yet.</p>
            <div className="flex flex-col gap-2">
              {poolItems.map((it) => (
                <ItemCard key={it.id} it={it} canEdit={canEdit} tripId={tripId} days={days} currency={currency} />
              ))}
              {poolItems.length === 0 && <p className="text-xs text-neutral-400">Nothing unscheduled.</p>}
            </div>
          </section>
          {canEdit && (
            <section className={card}>
              <h2 className="mb-2 font-semibold">Add your own item</h2>
              <form action={aAction} className="flex flex-col gap-2 text-sm">
                <input type="hidden" name="tripId" value={tripId} />
                <input name="title" placeholder="Title" aria-label="Title" required className={inp} />
                <div className="flex gap-2">
                  <select name="kind" aria-label="Type" className={`${inp} flex-1`}>
                    <option value="activity">Activity</option><option value="meal">Meal</option><option value="transport">Transport</option><option value="custom">Note</option>
                  </select>
                  <select name="day" aria-label="Day" className={`${inp} flex-1`}>
                    <option value="">Unscheduled</option>{dayOptions}
                  </select>
                </div>
                <input name="notes" placeholder="Notes (optional)" aria-label="Notes" className={inp} />
                <SubmitButton className={btn}>Add item</SubmitButton>
                {aState.error && <p className="text-xs text-red-600">{aState.error}</p>}
              </form>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter,
  useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  BedDouble, Bus, Footprints, GripVertical, Lock, LockOpen, LogOut, Map as MapIcon, MapPin, Pencil, Plane,
  PlaneLanding, Printer, Sparkles, StickyNote, Trash2, TriangleAlert, Utensils, type LucideIcon,
} from 'lucide-react';
import {
  addItemAction, autoArrangeAction, deleteItemAction, moveItemAction, placeItemAction,
  syncAnchorsAction, syncLegsAction, updateItemAction,
} from '@/lib/actions/itinerary';
import type { ActionState } from '@/lib/actions/people';
import { DayMap } from '@/components/day-map';
import { ui, HiddenIds } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import { useToast } from '@/components/toaster';
import { dayTiming } from '@/lib/domain/day-timing';
import { computeDrop, orderDay, type DropResult } from '@/lib/domain/itinerary';
import { dayLabel, money, plural } from '@/lib/ui-format';

const { btn, btn2, card, inp } = ui;
const iconBtn = 'rounded-md border border-neutral-200 p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800';

type Item = {
  id: string; day: string | null; kind: string; title: string;
  startTime: string | null; endTime: string | null; sortOrder: number;
  locked: boolean; system: boolean; unplanned: boolean;
  notes: string | null; plannedCost: number | null;
  lat: number | null; lon: number | null; optionId: string | null;
  durationMin: number | null; hoursNote: string | null;
  /** The linked shortlist option sits in the bin — the title is a snapshot. */
  optionRemoved: boolean;
};
type Leg = { id: string; fromItemId: string; toItemId: string; mode: string; durationMin: number | null; summary: string | null; deepLink: string | null; chosen: boolean };
type PoolOption = { id: string; title: string; lat: number | null; lon: number | null; closedDays: string[]; closedNote: string | null };

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

const colId = (day: string | null) => `col:${day ?? 'pool'}`;

function ItemCard({ it, canEdit, tripId, days, currency, dragHandle, onDelete }: {
  it: Item; canEdit: boolean; tripId: string; days: string[]; currency: string;
  dragHandle?: ReactNode; onDelete?: (it: Item) => void;
}) {
  const [editing, setEditing] = useState(false);
  const k = KIND[it.kind] ?? KIND.custom;
  const Icon = k.icon;
  const hm = (v: string | null) => v?.slice(0, 5) ?? '';
  const when = it.kind === 'checkin' ? 'from ' : it.kind === 'checkout' ? 'by ' : '';
  const meta = [
    it.startTime ? `${when}${hm(it.startTime)}${it.endTime ? `–${hm(it.endTime)}` : ''}` : null,
    it.plannedCost != null ? money(it.plannedCost, currency, 2) : null,
    it.notes,
  ].filter(Boolean).join(' · ');
  return (
    <div className={`rounded-lg border p-2.5 text-sm ${it.system ? 'border-teal-200 bg-teal-50/50' : 'border-neutral-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 basis-40 items-start gap-2">
          {dragHandle}
          <span title={k.label} className={`mt-0.5 rounded p-1 ${it.system ? 'bg-teal-100 text-teal-700' : 'bg-neutral-100 text-neutral-600'}`}>
            <Icon aria-hidden className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">
              {it.title}
              {it.locked && !it.system && <span className="ml-1.5 text-xs font-normal text-neutral-400">locked</span>}
              {it.optionRemoved && (
                <span className="ml-1.5 rounded bg-neutral-100 px-1.5 text-xs font-normal text-neutral-500" title="The shortlist option this came from was removed">
                  removed
                </span>
              )}
            </p>
            <p className="text-xs text-neutral-500">
              {meta || (it.system ? 'Added from your selected flight/stay' : canEdit ? 'No time set' : '')}
            </p>
            {it.hoursNote && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                <TriangleAlert aria-hidden className="h-3 w-3 shrink-0" />{it.hoursNote}
              </p>
            )}
          </div>
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1" data-no-print>
          {it.system && (
            <span className="rounded-md p-1 text-teal-600" title="Linked to your selected flight/stay — fixed" aria-label="Fixed item">
              <Lock aria-hidden className="h-3.5 w-3.5" />
            </span>
          )}
          {canEdit && !it.system && (
            <>
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
                <select key={it.day ?? 'pool'} name="day" aria-label="Move to day" defaultValue={it.day ?? 'pool'} className={`${inp} text-xs`} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                  <option value="pool">Unscheduled</option>
                  {days.map((d, i) => <option key={d} value={d}>Day {i + 1} · {dayLabel(d)}</option>)}
                </select>
              </form>
              <button type="button" className={iconBtn} onClick={() => onDelete?.(it)} aria-label="Delete item" title="Delete item">
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </span>
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

/** One sortable card; anchors and locked items render but cannot be dragged. */
function SortableCard(props: { it: Item; canEdit: boolean; tripId: string; days: string[]; currency: string; onDelete: (it: Item) => void }) {
  const { it, canEdit } = props;
  const draggable = canEdit && !it.system && !it.locked;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: it.id, disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : ''}
    >
      <ItemCard
        {...props}
        dragHandle={draggable ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${it.title} to another day or position`}
            title="Drag to another day or position"
            className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-neutral-300 hover:text-neutral-500 active:cursor-grabbing"
          >
            <GripVertical aria-hidden className="h-4 w-4" />
          </button>
        ) : null}
      />
    </div>
  );
}

/** A board column (one day, or the unscheduled pool) — itself a drop target. */
function Column({ day, heading, count, children, itemIds, isPool, mapToggle, mapPanel }: {
  day: string | null; heading: ReactNode; count: number;
  children: ReactNode; itemIds: string[]; isPool?: boolean;
  mapToggle?: ReactNode; mapPanel?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId(day) });
  return (
    <section
      ref={setNodeRef}
      className={`flex max-h-[70vh] w-64 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border p-3 shadow-sm sm:w-72 ${
        isOver ? 'border-teal-400 ring-2 ring-teal-600/25' : isPool ? 'border-dashed border-neutral-300' : 'border-neutral-200'
      } bg-white`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">
          {heading}
          <span aria-hidden="true" className="ml-2 rounded-full bg-neutral-100 px-1.5 text-xs font-medium text-neutral-600">{count}</span>
        </h2>
        {mapToggle}
      </div>
      {mapPanel}
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </section>
  );
}

const applyDrop = (list: Item[], id: string, drop: DropResult): Item[] =>
  list.map((i) => {
    if (i.id === id) {
      return { ...i, day: drop.day, unplanned: drop.day === null, startTime: drop.startTime, sortOrder: drop.sortOrder };
    }
    const sib = drop.siblings?.find((s) => s.id === i.id);
    return sib ? { ...i, sortOrder: sib.sortOrder } : i;
  });

function ItineraryBoard({ tripId, canEdit, days, items, legs, pool, currency }: {
  tripId: string; canEdit: boolean; days: string[]; currency: string;
  items: Item[]; legs: Leg[]; pool: PoolOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const synced = useRef(false);
  const [aState, aAction] = useActionState<ActionState, FormData>(addItemAction, {});
  const [itemsState, setItemsState] = useState<Item[]>(items);
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [openMaps, setOpenMaps] = useState<ReadonlySet<string>>(new Set());
  const pendingOps = useRef(0);
  const propItems = useRef(items);
  const legSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const legSyncBusy = useRef(false);

  // Server props win once optimistic mutations have drained.
  useEffect(() => {
    propItems.current = items;
    if (pendingOps.current === 0) setItemsState(items);
  }, [items]);

  /**
   * Trailing-edge debounce (~800ms) for leg sync: a burst of drags/edits
   * coalesces into one call, and at most one sync runs at a time (a busy
   * timer re-arms once). The server side is a cheap no-op check when nothing
   * is missing, and never records an event unless legs were actually written.
   */
  const scheduleRef = useRef<() => void>(() => {});
  const scheduleLegSync = useCallback(() => {
    if (!canEdit) return;
    if (legSyncTimer.current) clearTimeout(legSyncTimer.current);
    legSyncTimer.current = setTimeout(() => {
      legSyncTimer.current = null;
      if (legSyncBusy.current) { scheduleRef.current(); return; }
      legSyncBusy.current = true;
      const fd = new FormData(); fd.set('tripId', tripId);
      void syncLegsAction(fd)
        .catch(() => undefined)
        .then(() => { legSyncBusy.current = false; router.refresh(); });
    }, 800);
  }, [canEdit, tripId, router]);
  useEffect(() => { scheduleRef.current = scheduleLegSync; }, [scheduleLegSync]);

  useEffect(() => {
    if (synced.current || !canEdit) return;
    synced.current = true;
    const fd = new FormData(); fd.set('tripId', tripId);
    // Anchors first so their located pairs exist when legs sync.
    void syncAnchorsAction(fd)
      .then(() => syncLegsAction(fd))
      .then(() => router.refresh());
  }, [tripId, canEdit, router]);

  // Any post-mount change to server items (add/delete/move/reorder) may have
  // created a new located consecutive pair — schedule a debounced leg sync.
  const sawItems = useRef(false);
  useEffect(() => {
    if (!sawItems.current) { sawItems.current = true; return; }
    scheduleLegSync();
  }, [items, scheduleLegSync]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byDay = new Map<string, Item[]>();
  const poolItems = orderDay(itemsState.filter((i) => i.unplanned || !i.day));
  for (const i of itemsState) {
    if (i.unplanned || !i.day) continue;
    byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]);
  }
  for (const [d, arr] of byDay) byDay.set(d, orderDay(arr));
  const columnItems = (day: string | null): Item[] => (day === null ? poolItems : byDay.get(day) ?? []);

  const legBetween = (a: Item, b: Item) => legs.find((l) => l.fromItemId === a.id && l.toItemId === b.id && l.chosen)
    ?? legs.find((l) => l.fromItemId === a.id && l.toItemId === b.id);

  const dayName = (d: string | null) => {
    if (d === null) return 'unscheduled';
    const i = days.indexOf(d);
    return i >= 0 ? `Day ${i + 1}` : dayLabel(d);
  };

  const finishOp = () => {
    pendingOps.current -= 1;
    if (pendingOps.current === 0) setItemsState(propItems.current);
  };

  async function place(itemId: string, drop: DropResult, undo?: { day: string | null; startTime: string | null; sortOrder: number }) {
    const fd = new FormData();
    fd.set('tripId', tripId); fd.set('itemId', itemId);
    fd.set('day', drop.day ?? 'pool');
    fd.set('startTime', drop.startTime ?? '');
    fd.set('sortOrder', String(drop.sortOrder));
    if (drop.siblings?.length) fd.set('siblings', JSON.stringify(drop.siblings));
    await placeItemAction(fd);
    toast.push(`Item moved to ${dayName(drop.day)}`, {
      actionLabel: 'Undo',
      onAction: undo ? () => void undoPlace(itemId, undo) : undefined,
    });
  }

  async function undoPlace(itemId: string, prev: { day: string | null; startTime: string | null; sortOrder: number }) {
    let before = itemsState;
    pendingOps.current += 1;
    setItemsState((cur) => { before = cur; return applyDrop(cur, itemId, { ...prev }); });
    try {
      const fd = new FormData();
      fd.set('tripId', tripId); fd.set('itemId', itemId);
      fd.set('day', prev.day ?? 'pool');
      fd.set('startTime', prev.startTime ?? '');
      fd.set('sortOrder', String(prev.sortOrder));
      await placeItemAction(fd);
    } catch {
      setItemsState(before);
      toast.push('Could not undo the move.');
    } finally {
      finishOp();
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveItem(null);
    const itemId = String(e.active.id);
    const over = e.over;
    const dragged = itemsState.find((i) => i.id === itemId);
    if (!over || !dragged || over.id === e.active.id) return;
    const overId = String(over.id);
    let targetDay: string | null;
    let targetIndex: number;
    if (overId.startsWith('col:')) {
      targetDay = overId === 'col:pool' ? null : overId.slice(4);
      targetIndex = columnItems(targetDay).filter((i) => i.id !== itemId).length;
    } else {
      const overItem = itemsState.find((i) => i.id === overId);
      if (!overItem) return;
      targetDay = overItem.unplanned || !overItem.day ? null : overItem.day;
      // Index of the hovered card in the column's full order = insertion slot
      // once the dragged card is removed (works for both directions).
      targetIndex = columnItems(targetDay).findIndex((i) => i.id === overId);
    }
    const drop = computeDrop(columnItems(targetDay), itemId, targetDay, targetIndex);
    const before = itemsState;
    pendingOps.current += 1;
    setItemsState(applyDrop(before, itemId, drop));
    const undo = { day: dragged.day, startTime: dragged.startTime, sortOrder: dragged.sortOrder };
    void place(itemId, drop, undo).catch(() => {
      setItemsState(before);
      toast.push('Could not move that item — change reverted.');
    }).finally(() => {
      finishOp();
      scheduleLegSync();
    });
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveItem(itemsState.find((i) => i.id === String(e.active.id)) ?? null);
  }

  async function applyDelete(it: Item) {
    const before = itemsState;
    pendingOps.current += 1;
    setItemsState(before.filter((i) => i.id !== it.id));
    try {
      const fd = new FormData();
      fd.set('tripId', tripId); fd.set('itemId', it.id);
      await deleteItemAction(fd);
      toast.push('Item deleted', { actionLabel: 'Undo', onAction: () => void undoDelete(it) });
    } catch {
      setItemsState(before);
      toast.push('Could not delete — item restored.');
    } finally {
      finishOp();
    }
  }

  async function undoDelete(it: Item) {
    pendingOps.current += 1;
    try {
      const fd = new FormData();
      fd.set('tripId', tripId);
      fd.set('kind', KIND[it.kind] && ['activity', 'meal', 'transport', 'custom'].includes(it.kind) ? it.kind : 'custom');
      fd.set('title', it.title);
      if (it.day) fd.set('day', it.day);
      if (it.optionId) fd.set('optionId', it.optionId);
      if (it.lat != null) { fd.set('lat', String(it.lat)); fd.set('lon', String(it.lon ?? 0)); }
      if (it.notes) fd.set('notes', it.notes);
      if (it.plannedCost != null) { fd.set('plannedCost', String(it.plannedCost)); fd.set('plannedCurrency', currency); }
      if (it.startTime) fd.set('startTime', it.startTime);
      if (it.endTime) fd.set('endTime', it.endTime);
      if (it.locked) fd.set('locked', '1');
      const r = await addItemAction({}, fd);
      if (r?.error) throw new Error(r.error);
      router.refresh();
    } catch {
      toast.push('Could not restore that item.');
    } finally {
      finishOp();
    }
  }

  const dayOptions = days.map((d, i) => <option key={d} value={d}>Day {i + 1} · {dayLabel(d)}</option>);

  const toggleMap = (d: string) => setOpenMaps((cur) => {
    const next = new Set(cur);
    if (next.has(d)) next.delete(d); else next.add(d);
    return next;
  });

  return (
    <div className="flex flex-col gap-6">
      <section className={card} data-no-print>
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <p className="text-sm font-medium text-neutral-800">
              {days.length ? `${plural(days.length, 'day')} · ${dayLabel(days[0])} → ${dayLabel(days[days.length - 1])}` : 'No dates yet — select a flight or set trip dates.'}
            </p>
            <p className="text-xs text-neutral-500">
              Flights and your selected stay appear automatically. Drag cards between days, or use the day select on each card.
            </p>
          </div>
          <span className="flex-1" />
          {canEdit && (
            <span className="flex flex-col items-end gap-0.5">
              <form action={autoArrangeAction}>
                <input type="hidden" name="tripId" value={tripId} />
                <SubmitButton className={btn2} disabled={poolItems.length === 0} title="Places unscheduled items on days, grouping nearby spots together">
                  <Sparkles aria-hidden className="h-3.5 w-3.5" />Auto-arrange unscheduled
                </SubmitButton>
              </form>
              {poolItems.length === 0 && <span className="text-xs text-neutral-400">Add unscheduled items first</span>}
            </span>
          )}
          <button className={`${btn2} inline-flex items-center gap-1`} type="button" onClick={() => window.print()}>
            <Printer aria-hidden className="h-3.5 w-3.5" />Print
          </button>
        </div>
      </section>

      <DndContext
        id="itinerary-board"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveItem(null)}
      >
        <div className="flex items-start gap-3 overflow-x-auto pb-2" data-no-print>
          {/* The Unscheduled tray renders first so it is on-screen on mobile
              (it used to trail the day columns, off-screen to the right). */}
          <Column
            day={null} isPool itemIds={poolItems.map((i) => i.id)} count={poolItems.length}
            heading="Unscheduled"
          >
            {canEdit && pool.length > 0 && (
              <ul className="flex flex-col gap-2 text-sm">
                {pool.map((o) => (
                  <li key={o.id}>
                    <form action={aAction} className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 p-2">
                      <HiddenIds tripId={tripId} section="itinerary" optionId={o.id} />
                      <input type="hidden" name="kind" value="activity" /><input type="hidden" name="title" value={o.title} />
                      {o.lat != null && <><input type="hidden" name="lat" value={o.lat} /><input type="hidden" name="lon" value={o.lon ?? 0} /></>}
                      <span className="truncate font-medium" title={o.title}>{o.title}</span>
                      {o.closedNote && <span className="text-xs text-amber-700">{o.closedNote}</span>}
                      <span className="flex gap-1.5">
                        <select name="day" aria-label={`Day for ${o.title}`} className={`${inp} min-w-0 flex-1 text-xs`} defaultValue="">
                          <option value="">Unscheduled</option>
                          {days.map((d, i) => (
                            <option key={d} value={d}>
                              Day {i + 1} · {dayLabel(d)}{o.closedDays.includes(d) ? ' · closed' : ''}
                            </option>
                          ))}
                        </select>
                        <SubmitButton className={btn2}>Add</SubmitButton>
                      </span>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {poolItems.map((it) => (
              <SortableCard key={it.id} it={it} canEdit={canEdit} tripId={tripId} days={days} currency={currency} onDelete={applyDelete} />
            ))}
            {poolItems.length === 0 && !(canEdit && pool.length > 0) && (
              <p className="py-4 text-center text-xs text-neutral-400">Nothing unscheduled.</p>
            )}
            {canEdit && (
              <form action={aAction} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-2 text-sm">
                <input type="hidden" name="tripId" value={tripId} />
                <p className="text-xs font-medium text-neutral-600">Add your own item</p>
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
            )}
          </Column>

          {days.map((d, di) => {
            const col = columnItems(d);
            const flags = dayTiming(col, legs);
            const located = col
              .filter((i): i is Item & { lat: number; lon: number } => i.lat != null && i.lon != null)
              .map((i, n) => ({ id: i.id, lat: i.lat, lon: i.lon, title: i.title, n: n + 1 }));
            const mapOpen = openMaps.has(d);
            return (
              <Column
                key={d} day={d} itemIds={col.map((i) => i.id)} count={col.length}
                heading={<><span className="mr-1 text-xs font-medium uppercase tracking-wide text-teal-700">Day {di + 1}</span> · {dayLabel(d)}</>}
                mapToggle={located.length >= 2 ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                    aria-expanded={mapOpen}
                    aria-label={`Toggle map for Day ${di + 1}`}
                    title="Show located items in order on a map"
                    onClick={() => toggleMap(d)}
                  >
                    <MapIcon aria-hidden className="h-3 w-3" />Map
                  </button>
                ) : undefined}
                mapPanel={mapOpen && located.length >= 2 ? <DayMap points={located} /> : undefined}
              >
                {col.map((it, i, arr) => (
                  <div key={it.id}>
                    <SortableCard it={it} canEdit={canEdit} tripId={tripId} days={days} currency={currency} onDelete={applyDelete} />
                    {i < arr.length - 1 && (() => {
                      const next = arr[i + 1];
                      const leg = legBetween(it, next);
                      const pairLocated = it.lat != null && it.lon != null && next.lat != null && next.lon != null;
                      if (!leg && !pairLocated) return null; // items never had locations — stay silent
                      const flag = flags.find((f) => f.fromId === it.id && f.toId === next.id);
                      return (
                        <>
                          {leg ? (
                            <p className="mx-3 flex items-center gap-1 border-l-2 border-dashed border-neutral-300 py-1 pl-3 text-xs text-neutral-500">
                              <Footprints aria-hidden className="h-3 w-3" />
                              {leg.mode}{leg.durationMin != null ? ` · ${leg.durationMin} min` : ''}{leg.summary ? ` · ${leg.summary}` : ''}
                              {leg.deepLink && <> · <a href={leg.deepLink} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">directions</a></>}
                            </p>
                          ) : (
                            <p className="mx-3 flex items-center gap-1 border-l-2 border-dashed border-neutral-200 py-1 pl-3 text-xs text-neutral-400">
                              <Footprints aria-hidden className="h-3 w-3" />
                              route unknown
                              {canEdit && <> — <Link href={`/trips/${tripId}/transport`} className="text-teal-700 underline">add one</Link></>}
                            </p>
                          )}
                          {flag && (
                            <p className="mx-3 flex items-center gap-1 border-l-2 border-amber-300 py-1 pl-3 text-xs text-amber-700">
                              <TriangleAlert aria-hidden className="h-3 w-3 shrink-0" />
                              Tight connection — needs ~{flag.neededMin} min, {Math.max(0, flag.availableMin)} available
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ))}
                {col.length === 0 && (
                  <p className="py-4 text-center text-xs text-neutral-400">Nothing planned yet{canEdit ? ' — drop items here.' : '.'}</p>
                )}
              </Column>
            );
          })}
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="w-64 opacity-90 shadow-lg sm:w-72">
              <ItemCard it={activeItem} canEdit={false} tripId={tripId} days={days} currency={currency} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Print: clean day-by-day list, shown only on paper. */}
      <section className="hidden print:block" aria-hidden="true">
        <h1 className="text-xl font-bold">Itinerary</h1>
        <p className="mb-3 text-sm text-neutral-600">
          {days.length ? `${plural(days.length, 'day')} · ${dayLabel(days[0])} → ${dayLabel(days[days.length - 1])}` : 'No dates set'}
        </p>
        {days.map((d, di) => (
          <div key={d} className="mb-3" style={{ breakInside: 'avoid' }}>
            <h2 className="font-semibold">Day {di + 1} · {dayLabel(d)}</h2>
            <ul className="ml-4 list-disc text-sm">
              {(byDay.get(d) ?? []).map((it) => (
                <li key={it.id}>
                  {it.startTime ? `${it.startTime.slice(0, 5)} ` : ''}{it.title}
                  {it.plannedCost != null ? ` · ${money(it.plannedCost, currency, 2)}` : ''}
                  {it.notes ? ` — ${it.notes}` : ''}
                </li>
              ))}
              {(byDay.get(d) ?? []).length === 0 && <li className="text-neutral-400">Nothing planned</li>}
            </ul>
          </div>
        ))}
        {poolItems.length > 0 && (
          <div className="mb-3" style={{ breakInside: 'avoid' }}>
            <h2 className="font-semibold">Unscheduled</h2>
            <ul className="ml-4 list-disc text-sm">
              {poolItems.map((it) => <li key={it.id}>{it.title}</li>)}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

// The ToastProvider lives at the trip layout level (TripPulse) so pulse
// toasts and board toasts share one stack.
export function ItineraryClient(props: Parameters<typeof ItineraryBoard>[0]) {
  return <ItineraryBoard {...props} />;
}

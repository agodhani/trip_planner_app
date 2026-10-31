import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { itineraryItems, transportLegs, tripOptions } from '@/lib/db/schema';
import { todayISO } from '@/lib/clock';
import { candidatePairs } from '@/lib/domain/dates/strategy';
import { autoAssign, dayList } from '@/lib/domain/itinerary';
import { env } from '@/lib/env';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent, type Tx } from './events';
import { getTrip } from './trips';
import type { TripRow } from './trips';

export type ItemRow = typeof itineraryItems.$inferSelect;
export type LegRow = typeof transportLegs.$inferSelect;

/** Trip days: explicit dates > selected flight > first strategy pair. */
export function tripDays(trip: TripRow): { start: string; end: string; days: string[] } | null {
  if (trip.startDate && trip.endDate) {
    return { start: trip.startDate, end: trip.endDate, days: dayList(trip.startDate, trip.endDate) };
  }
  const pairs = candidatePairs(trip.dateStrategy, todayISO('UTC'), env.FLIGHT_SCAN_MAX_PAIRS);
  const p = pairs.ok ? pairs.pairs[0] : undefined;
  if (p?.back) {
    return { start: p.depart, end: p.back, days: dayList(p.depart, p.back) };
  }
  return null;
}

export async function listItems(tripId: string): Promise<ItemRow[]> {
  return db.select().from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.day), asc(itineraryItems.sortOrder), asc(itineraryItems.createdAt));
}

export async function listLegs(tripId: string): Promise<LegRow[]> {
  return db.select().from(transportLegs).where(eq(transportLegs.tripId, tripId));
}

type AnchorInsert = {
  kind: 'flight_depart' | 'flight_arrive' | 'checkin' | 'checkout';
  day: string;
  time?: string;
  title: string;
  optionId?: string;
  lat?: number; lon?: number;
  anchorKey: string;
};

function flightAnchors(trip: TripRow, opt: typeof tripOptions.$inferSelect): AnchorInsert[] {
  const d = opt.data as {
    outbound?: { departLocal?: string; arriveLocal?: string; from?: { code?: string }; to?: { code?: string } };
    return?: { departLocal?: string; arriveLocal?: string; from?: { code?: string }; to?: { code?: string } };
  };
  const out: AnchorInsert[] = [];
  const push = (kind: AnchorInsert['kind'], leg: typeof d.outbound, key: string, dir: string) => {
    const local = kind === 'flight_depart' ? leg?.departLocal : leg?.arriveLocal;
    if (!leg || !local) return;
    const place = kind === 'flight_depart' ? leg.from?.code : leg.to?.code;
    out.push({
      kind, day: local.slice(0, 10), time: local.slice(11, 16),
      title: `${kind === 'flight_depart' ? 'Fly out' : 'Arrive'} ${dir}${place ? ` · ${place}` : ''}`,
      optionId: opt.id, anchorKey: key,
    });
  };
  push('flight_depart', d.outbound, `fl:${opt.id}:out:d`, 'outbound');
  push('flight_arrive', d.outbound, `fl:${opt.id}:out:a`, 'outbound');
  if (d.return) {
    push('flight_depart', d.return, `fl:${opt.id}:ret:d`, 'back');
    push('flight_arrive', d.return, `fl:${opt.id}:ret:a`, 'back');
  }
  return out;
}

function stayAnchors(trip: TripRow, opt: typeof tripOptions.$inferSelect): AnchorInsert[] {
  const d = opt.data as { checkIn?: string; checkOut?: string; checkInTime?: string; checkOutTime?: string };
  const out: AnchorInsert[] = [];
  if (d.checkIn) {
    out.push({ kind: 'checkin', day: d.checkIn, time: d.checkInTime?.replace(/\s*(AM|PM)/i, '').trim(), title: `Check in · ${opt.title}`, optionId: opt.id, lat: opt.lat ?? undefined, lon: opt.lon ?? undefined, anchorKey: `st:${opt.id}:in` });
  }
  if (d.checkOut) {
    out.push({ kind: 'checkout', day: d.checkOut, time: d.checkOutTime?.replace(/\s*(AM|PM)/i, '').trim(), title: `Check out · ${opt.title}`, optionId: opt.id, lat: opt.lat ?? undefined, lon: opt.lon ?? undefined, anchorKey: `st:${opt.id}:out` });
  }
  return out;
}

export async function anchorSpecs(trip: TripRow): Promise<AnchorInsert[]> {
  const rows = await db.select().from(tripOptions)
    .where(eq(tripOptions.tripId, trip.id));
  const chosen = rows.filter((o) => o.status === 'selected' || o.status === 'booked');
  const specs: AnchorInsert[] = [];
  for (const o of chosen) {
    if (o.kind === 'flight') specs.push(...flightAnchors(trip, o));
    if (o.kind === 'lodging') specs.push(...stayAnchors(trip, o));
  }
  return specs;
}

/** Idempotent: inserts missing anchor items, removes stale system ones. */
export async function syncAnchors(user: { id: string; name: string }, tripId: string) {
  await assertTripRole(tripId, user.id, 'editor');
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError();
  const specs = await anchorSpecs(trip);
  const wanted = new Set(specs.map((s) => s.anchorKey));
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(itineraryItems)
      .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.system, true)));
    const have = new Map<string, ItemRow>();
    for (const it of existing) {
      const key = (it.location as { anchorKey?: string } | null)?.anchorKey;
      if (key) have.set(key, it);
    }
    for (const s of specs) {
      const cur = have.get(s.anchorKey);
      if (cur) {
        await tx.update(itineraryItems).set({
          day: s.day, startTime: s.time ?? null, title: s.title,
          location: { lat: s.lat ?? null, lon: s.lon ?? null, anchorKey: s.anchorKey },
        }).where(eq(itineraryItems.id, cur.id));
      } else {
        await tx.insert(itineraryItems).values({
          tripId, day: s.day, startTime: s.time ?? null, kind: s.kind,
          title: s.title, optionId: s.optionId ?? null,
          location: { lat: s.lat ?? null, lon: s.lon ?? null, anchorKey: s.anchorKey },
          system: true, locked: true, sortOrder: s.kind === 'flight_depart' ? 0 : s.kind === 'checkin' ? 50 : s.kind === 'checkout' ? 0 : 90,
          createdBy: user.id,
        });
      }
    }
    for (const it of existing) {
      const key = (it.location as { anchorKey?: string } | null)?.anchorKey;
      if (key && !wanted.has(key)) {
        await tx.delete(itineraryItems).where(eq(itineraryItems.id, it.id));
      }
    }
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'itinerary.anchors_synced',
      summary: `${user.name} synced itinerary anchors (${specs.length})`, entityType: 'trip', entityId: tripId,
    });
  });
  return specs.length;
}

export async function addItem(
  user: { id: string; name: string }, tripId: string,
  input: {
    kind: 'activity' | 'meal' | 'transport' | 'custom';
    title: string; day?: string | null; optionId?: string | null;
    lat?: number | null; lon?: number | null; notes?: string | null;
    plannedCost?: number | null; plannedCurrency?: string | null;
  },
) {
  await assertTripRole(tripId, user.id, 'editor');
  return db.transaction(async (tx) => {
    const max = await tx.select({ sortOrder: itineraryItems.sortOrder }).from(itineraryItems)
      .where(and(eq(itineraryItems.tripId, tripId), input.day ? eq(itineraryItems.day, input.day) : eq(itineraryItems.unplanned, true)));
    const sort = Math.max(0, ...max.map((r) => r.sortOrder)) + 10;
    const [row] = await tx.insert(itineraryItems).values({
      tripId, day: input.day ?? null, kind: input.kind, title: input.title,
      optionId: input.optionId ?? null,
      location: input.lat != null && input.lon != null ? { lat: input.lat, lon: input.lon } : null,
      notes: input.notes ?? null,
      plannedCost: input.plannedCost != null ? String(input.plannedCost) : null,
      plannedCurrency: input.plannedCurrency ?? null,
      unplanned: !input.day, sortOrder: sort, createdBy: user.id,
    }).returning();
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'itinerary.item_added',
      summary: `${user.name} added ${input.title}${input.day ? ` on ${input.day}` : ' to the pool'}`,
      entityType: 'itinerary_item', entityId: row.id,
    });
    return row;
  });
}

export async function moveItem(
  user: { id: string; name: string }, tripId: string, itemId: string,
  target: { day: string | null; unplanned?: boolean; sortOrder?: number },
) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const cur = await tx.select().from(itineraryItems)
      .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId))).limit(1);
    if (!cur[0]) throw new NotFoundError('Item not found');
    const unplanned = target.day === null || target.unplanned === true;
    await tx.update(itineraryItems).set({
      day: unplanned ? null : target.day,
      unplanned,
      sortOrder: target.sortOrder ?? cur[0].sortOrder,
      updatedAt: new Date(),
    }).where(eq(itineraryItems.id, itemId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'itinerary.item_moved',
      summary: `${user.name} moved ${cur[0].title}${unplanned ? ' to the pool' : ` to ${target.day}`}`,
      entityType: 'itinerary_item', entityId: itemId,
    });
  });
}

export async function updateItem(
  user: { id: string; name: string }, tripId: string, itemId: string,
  patch: { title?: string; startTime?: string | null; endTime?: string | null; notes?: string | null; locked?: boolean; durationMin?: number | null; plannedCost?: number | null; plannedCurrency?: string | null },
) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const cur = await tx.select().from(itineraryItems)
      .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId))).limit(1);
    if (!cur[0]) throw new NotFoundError('Item not found');
    await tx.update(itineraryItems).set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
      ...(patch.endTime !== undefined ? { endTime: patch.endTime } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
      ...(patch.durationMin !== undefined ? { durationMin: patch.durationMin } : {}),
      ...(patch.plannedCost !== undefined ? { plannedCost: patch.plannedCost != null ? String(patch.plannedCost) : null } : {}),
      ...(patch.plannedCurrency !== undefined ? { plannedCurrency: patch.plannedCurrency } : {}),
      updatedAt: new Date(),
    }).where(eq(itineraryItems.id, itemId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'itinerary.item_updated',
      summary: `${user.name} edited ${cur[0].title}`,
      entityType: 'itinerary_item', entityId: itemId,
    });
  });
}

export async function deleteItem(user: { id: string; name: string }, tripId: string, itemId: string) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx: Tx) => {
    const cur = await tx.select().from(itineraryItems)
      .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId))).limit(1);
    if (!cur[0]) throw new NotFoundError('Item not found');
    await tx.delete(itineraryItems).where(eq(itineraryItems.id, itemId));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'itinerary.item_removed',
      summary: `${user.name} removed ${cur[0].title}`,
      entityType: 'itinerary_item', entityId: itemId,
    });
  });
}

/** Assign unplanned + unlocked items to days by geo clustering. */
export async function autoArrange(user: { id: string; name: string }, tripId: string) {
  await assertTripRole(tripId, user.id, 'editor');
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError();
  const range = tripDays(trip);
  if (!range) throw new Error('Set trip dates (or select a flight) before auto-arranging');
  const items = await listItems(tripId);
  const free = items.filter((i) => (i.unplanned || !i.locked) && !i.system && (i.unplanned || true))
    .filter((i) => i.unplanned);
  if (!free.length) return { assigned: 0 };

  const locOf = (i: ItemRow) => (i.location as { lat?: number; lon?: number } | null);
  const anchorByDay = new Map<string, { lat: number; lon: number } | null>();
  for (const d of range.days) {
    const stay = items.find((i) => i.system && i.day === d && (i.kind === 'checkin' || i.kind === 'checkout') && locOf(i)?.lat != null);
    const st = stay ? locOf(stay) : null;
    anchorByDay.set(d, st && st.lat != null && st.lon != null ? { lat: st.lat, lon: st.lon } : { lat: trip.destination.lat, lon: trip.destination.lon });
  }
  const perDay = Math.max(2, Math.ceil(free.length / Math.max(1, range.days.length)));
  const plan = autoAssign(
    range.days.map((d) => ({ day: d, anchor: anchorByDay.get(d) ?? null, capacity: perDay })),
    free.map((i) => ({ id: i.id, lat: locOf(i)?.lat ?? null, lon: locOf(i)?.lon ?? null })),
  );

  await db.transaction(async (tx) => {
    for (const d of range.days) {
      const ids = plan.get(d) ?? [];
      for (let i = 0; i < ids.length; i++) {
        await tx.update(itineraryItems).set({
          day: d, unplanned: false, sortOrder: (i + 1) * 10, updatedAt: new Date(),
        }).where(eq(itineraryItems.id, ids[i]));
      }
    }
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'itinerary.auto_arranged',
      summary: `${user.name} auto-arranged ${free.length} activities across ${range.days.length} days`,
      entityType: 'trip', entityId: tripId,
    });
  });
  return { assigned: free.length };
}

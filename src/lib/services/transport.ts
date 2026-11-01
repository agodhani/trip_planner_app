import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { itineraryItems, transportLegs } from '@/lib/db/schema';
import { routeEstimate } from '@/lib/providers/routing';
import { planTransit } from '@/lib/providers/transitous';
import { ProviderError } from '@/lib/providers/types';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent } from './events';
import { listItems, tripDays } from './itinerary';
import { getTrip } from './trips';

export type Point = { lat: number; lon: number };

export function mapsDirLink(from: Point, to: Point, mode: 'walking' | 'driving' | 'transit' | 'bicycling'): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=${mode}`;
}

const loc = (i: typeof itineraryItems.$inferSelect): Point | null => {
  const l = i.location as { lat?: number | null; lon?: number | null } | null;
  return l && l.lat != null && l.lon != null ? { lat: l.lat, lon: l.lon } : null;
};

/** Consecutive located item pairs, per day. */
export async function legPairs(tripId: string) {
  const items = (await listItems(tripId)).filter((i) => i.day && !i.unplanned);
  const byDay = new Map<string, typeof items>();
  for (const i of items) {
    const arr = byDay.get(i.day!) ?? [];
    arr.push(i);
    byDay.set(i.day!, arr);
  }
  const pairs: { from: typeof items[0]; to: typeof items[0] }[] = [];
  for (const arr of byDay.values()) {
    const sorted = [...arr].sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (loc(sorted[i]) && loc(sorted[i + 1])) pairs.push({ from: sorted[i], to: sorted[i + 1] });
    }
  }
  return pairs;
}

/** Compute/refresh legs for all located consecutive pairs. */
export async function computeLegs(user: { id: string; name: string }, tripId: string) {
  await assertTripRole(tripId, user.id, 'editor');
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError();
  const pairs = await legPairs(tripId);
  let computed = 0, failed = 0;
  for (const { from, to } of pairs) {
    const a = loc(from)!, b = loc(to)!;
    const dayTime = `${from.day}T12:00:00Z`;
    for (const mode of ['walk', 'drive', 'transit'] as const) {
      try {
        let leg: { durationMin: number; distanceM: number | null; summary: string; source: 'osrm' | 'fossgis' | 'transitous'; details?: object };
        if (mode === 'transit') {
          const p = await planTransit(a, b, dayTime, { tripId, userId: user.id });
          if (!p) continue;
          leg = { durationMin: p.durationMin, distanceM: null, summary: `${p.summary}${p.transfers ? ` · ${p.transfers} transfer${p.transfers === 1 ? '' : 's'}` : ''}`, source: 'transitous', details: { legs: p.legs } };
        } else {
          const r = await routeEstimate(mode === 'walk' ? 'walk' : 'drive', a, b, { tripId, userId: user.id });
          if (!r) continue;
          leg = { durationMin: r.durationMin, distanceM: r.distanceM, summary: `${r.durationMin} min · ${(r.distanceM / 1000).toFixed(1)} km`, source: mode === 'walk' ? 'fossgis' : 'osrm' };
        }
        const deepLink = mapsDirLink(a, b, mode === 'walk' ? 'walking' : mode === 'drive' ? 'driving' : 'transit');
        await db.insert(transportLegs).values({
          tripId, fromItemId: from.id, toItemId: to.id, mode: mode === 'drive' ? 'drive' : mode,
          durationMin: leg.durationMin, distanceM: leg.distanceM, summary: leg.summary,
          source: leg.source, details: leg.details ?? null, deepLink,
          chosen: false, computedAt: new Date(),
        }).onConflictDoUpdate({
          target: [transportLegs.fromItemId, transportLegs.toItemId, transportLegs.mode],
          set: { durationMin: leg.durationMin, distanceM: leg.distanceM, summary: leg.summary, source: leg.source, details: leg.details ?? null, deepLink, computedAt: new Date() },
        });
        computed++;
      } catch (err) {
        failed++;
        if (!(err instanceof ProviderError)) throw err;
      }
    }
  }
  // Auto-choose a sensible default per pair: walk ≤ 20 min, else transit, else drive.
  const legs = await db.select().from(transportLegs).where(eq(transportLegs.tripId, tripId));
  const pairsSeen = new Map<string, LegRow[]>();
  type LegRow = typeof transportLegs.$inferSelect;
  for (const l of legs) {
    const k = `${l.fromItemId}|${l.toItemId}`;
    pairsSeen.set(k, [...(pairsSeen.get(k) ?? []), l]);
  }
  await db.transaction(async (tx) => {
    for (const arr of pairsSeen.values()) {
      if (arr.some((l) => l.chosen)) continue;
      const walk = arr.find((l) => l.mode === 'walk' && (l.durationMin ?? 999) <= 20);
      const pick = walk ?? arr.find((l) => l.mode === 'transit') ?? arr.find((l) => l.mode === 'drive') ?? arr[0];
      await tx.update(transportLegs).set({ chosen: true }).where(eq(transportLegs.id, pick.id));
    }
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'transport.legs_computed',
      summary: `${user.name} computed ${computed} route legs${failed ? ` (${failed} unavailable)` : ''}`,
      entityType: 'trip', entityId: tripId,
    });
  });
  return { computed, failed };
}

export async function chooseLeg(user: { id: string }, tripId: string, legId: string) {
  await assertTripRole(tripId, user.id, 'editor');
  await db.transaction(async (tx) => {
    const cur = await tx.select().from(transportLegs)
      .where(and(eq(transportLegs.id, legId), eq(transportLegs.tripId, tripId))).limit(1);
    if (!cur[0]) throw new NotFoundError('Leg not found');
    await tx.update(transportLegs).set({ chosen: false })
      .where(and(eq(transportLegs.fromItemId, cur[0].fromItemId), eq(transportLegs.toItemId, cur[0].toItemId)));
    await tx.update(transportLegs).set({ chosen: true }).where(eq(transportLegs.id, legId));
  });
}

/** Manual leg (taxi, rental, ferry…) between two scheduled items. */
export async function addManualLeg(
  user: { id: string; name: string }, tripId: string,
  input: { fromItemId: string; toItemId: string; mode: 'walk' | 'transit' | 'drive' | 'bike' | 'other';
    durationMin?: number | null; summary: string; cost?: number | null; currency?: string | null },
) {
  await assertTripRole(tripId, user.id, 'editor');
  const rows = await db.select().from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), inArray(itineraryItems.id, [input.fromItemId, input.toItemId])));
  if (rows.length !== 2) throw new NotFoundError('Both items must exist on this trip');
  const [row] = await db.insert(transportLegs).values({
    tripId, fromItemId: input.fromItemId, toItemId: input.toItemId, mode: input.mode,
    durationMin: input.durationMin ?? null, distanceM: null, summary: input.summary,
    source: 'manual',
    details: input.cost != null ? { cost: input.cost, currency: input.currency } : null,
    deepLink: null, chosen: true,
  }).onConflictDoUpdate({
    target: [transportLegs.fromItemId, transportLegs.toItemId, transportLegs.mode],
    set: {
      durationMin: input.durationMin ?? null, distanceM: null, summary: input.summary,
      source: 'manual',
      details: input.cost != null ? { cost: input.cost, currency: input.currency } : null,
      deepLink: null, computedAt: new Date(),
    },
  }).returning();
  await db.transaction(async (tx) => {
    await tx.update(transportLegs).set({ chosen: false })
      .where(and(eq(transportLegs.fromItemId, input.fromItemId), eq(transportLegs.toItemId, input.toItemId)));
    await tx.update(transportLegs).set({ chosen: true }).where(eq(transportLegs.id, row.id));
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'transport.leg_added',
      summary: `${user.name} added a ${input.mode} leg: ${input.summary}`,
      entityType: 'transport_leg', entityId: row.id,
    });
  });
  return row;
}

export async function legsWithItems(tripId: string) {
  const [items, legs] = await Promise.all([listItems(tripId), db.select().from(transportLegs).where(eq(transportLegs.tripId, tripId)).orderBy(asc(transportLegs.computedAt))]);
  const byId = new Map(items.map((i) => [i.id, i]));
  return legs.map((l) => ({ leg: l, from: byId.get(l.fromItemId), to: byId.get(l.toItemId) }));
}

export { tripDays };

import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { after } from 'next/server';
import { db } from '@/lib/db/client';
import { flightSearches } from '@/lib/db/schema';
import { todayISO } from '@/lib/clock';
import { candidatePairs, type DatePair } from '@/lib/domain/dates/strategy';
import { passesWindow, windowForDate } from '@/lib/domain/dates/windows';
import { env } from '@/lib/env';
import { searchOutbounds, searchReturns } from '@/lib/providers/googleFlights';
import type { FlightItinerary, FlightSearchRequest } from '@/lib/providers/types';
import { dateRange, dayLabel, money } from '@/lib/ui-format';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent } from './events';
import { getTrip } from './trips';

export type PairResult = {
  depart: string; back: string | null;
  status: 'pending' | 'done' | 'error';
  minTotal: number | null; minPerPerson: number | null; currency: string | null;
  count: number; rawCount: number;
  isFrom: boolean;
  verified?: 'ok' | 'no_match';
  sparsePassengerMix?: boolean;
  clippedWindow?: boolean;
  error?: { kind: string; message: string };
};

export function paxFromTrip(trip: { adults: number; childrenAges: number[] }, adultsOnly = false) {
  const children = trip.childrenAges.filter((a) => a >= 2 && a <= 11).length;
  const lap = trip.childrenAges.filter((a) => a < 2).length;
  const seats = trip.childrenAges.filter((a) => a >= 12).length;
  if (adultsOnly) {
    return { adults: trip.adults + children + seats, children: 0, infantsInSeat: 0, infantsOnLap: 0 };
  }
  return { adults: trip.adults + seats, children, infantsInSeat: 0, infantsOnLap: lap };
}


/** Summarize one pair from fetched itineraries + filters (pure, tested). */
export function summarizePair(
  pair: DatePair,
  itineraries: FlightItinerary[],
  rawCount: number,
  sparse: boolean,
  prefs: { outboundWindow?: { start: string; end: string }; windowTz: string; outboundTz: string },
): PairResult {
  const filtered = itineraries.filter((it) =>
    passesWindow(it.outbound.departLocal, prefs.outboundTz, prefs.outboundWindow, prefs.windowTz, pair.depart),
  );
  const priced = filtered.filter((i) => i.price.total !== null);
  const min = priced.reduce((m, i) => Math.min(m, i.price.total!), Infinity);
  const minPP = priced.reduce((m, i) => Math.min(m, i.price.perPerson ?? Infinity), Infinity);
  return {
    depart: pair.depart, back: pair.back, status: 'done',
    minTotal: priced.length ? min : null,
    minPerPerson: priced.length ? minPP : null,
    currency: priced[0]?.price.currency ?? null,
    count: filtered.length, rawCount,
    isFrom: itineraries.some((i) => i.price.isFrom),
    sparsePassengerMix: sparse || undefined,
    clippedWindow: prefs.outboundWindow
      ? windowForDate(prefs.outboundWindow, prefs.windowTz, prefs.outboundTz, pair.depart)?.clipped ?? false
      : undefined,
    error: undefined,
  };
}

/** Pick the N cheapest priced pairs (pure, tested). */
export function cheapestPairs(results: PairResult[], n = 3): PairResult[] {
  return results
    .filter((r) => r.status === 'done' && r.minTotal !== null)
    .sort((a, b) => a.minTotal! - b.minTotal!)
    .slice(0, n);
}

/** Merge a verified return price into a pair result (pure, tested). */
export function applyVerification(
  result: PairResult,
  validTotals: number[],
  payingPax = 1,
): PairResult {
  if (!validTotals.length) return { ...result, verified: 'no_match', minTotal: null, minPerPerson: null };
  const min = Math.min(...validTotals);
  return { ...result, verified: 'ok', minTotal: min, minPerPerson: min / Math.max(1, payingPax) };
}

async function runScan(searchId: string) {
  const dbAny = db;
  const rows = await dbAny.select().from(flightSearches).where(eq(flightSearches.id, searchId)).limit(1);
  const search = rows[0];
  if (!search) return;
  const req = search.request as {
    tripId: string; userId: string; pairs: DatePair[];
    base: Omit<FlightSearchRequest, 'outboundDate' | 'returnDate'>;
    prefs: { tz: string; outboundDepart?: { start: string; end: string }; returnDepart?: { start: string; end: string } };
    originTz: string; returnTz: string; adultsOnly: boolean;
  };
  const results: PairResult[] = req.pairs.map((p) => ({
    depart: p.depart, back: p.back, status: 'pending', minTotal: null, minPerPerson: null,
    currency: null, count: 0, rawCount: 0, isFrom: false,
  }));
  let completed = 0;
  let consecutiveFails = 0;
  const write = async () => {
    await dbAny.update(flightSearches)
      .set({ completed, result: { pairs: results }, status: 'running' })
      .where(eq(flightSearches.id, searchId));
  };
  await write();
  const verifyQueue: { pair: DatePair; index: number; candidates: FlightItinerary[] }[] = [];
  for (let i = 0; i < req.pairs.length; i++) {
    const pair = req.pairs[i];
    try {
      const r = await searchOutbounds(
        { ...req.base, outboundDate: pair.depart, returnDate: pair.back ?? undefined },
        { ttlSeconds: 2 * 60 * 60, tripId: req.tripId, userId: req.userId },
      );
      results[i] = summarizePair(pair, r.itineraries, r.rawCount, r.sparsePassengerMix, {
        outboundWindow: req.prefs.outboundDepart, windowTz: req.prefs.tz, outboundTz: req.originTz,
      });
      const priced = r.itineraries.filter((it) => it.price.total !== null)
        .sort((a, b) => a.price.total! - b.price.total!).slice(0, 3);
      if (pair.back && priced.length) verifyQueue.push({ pair, index: i, candidates: priced });
      consecutiveFails = 0;
    } catch (err) {
      consecutiveFails++;
      results[i] = {
        ...results[i], status: 'error',
        error: { kind: err instanceof Object && 'kind' in err ? String((err as { kind: unknown }).kind) : 'network',
                 message: err instanceof Error ? err.message : String(err) },
      };
      if (consecutiveFails >= 5) {
        await dbAny.update(flightSearches)
          .set({ status: 'failed', error: 'blocked', result: { pairs: results }, completed, finishedAt: new Date() })
          .where(eq(flightSearches.id, searchId));
        return;
      }
    }
    completed++;
    await write();
  }
  // Verification: 3 cheapest pairs × top 3 outbounds.
  const cheap = cheapestPairs(results, 3);
  for (const entry of verifyQueue) {
    const target = results[entry.index];
    if (!cheap.includes(target)) continue;
    const totals: number[] = [];
    for (const cand of entry.candidates) {
      try {
        const rr = await searchReturns(
          { ...req.base, outboundDate: entry.pair.depart, returnDate: entry.pair.back! },
          cand, { ttlSeconds: 2 * 60 * 60, tripId: req.tripId, userId: req.userId },
        );
        for (const it of rr.itineraries) {
          if (it.price.total === null) continue;
          if (passesWindow(it.return!.departLocal, req.returnTz, req.prefs.returnDepart, req.prefs.tz, entry.pair.back!)) {
            totals.push(it.price.total);
          }
        }
      } catch { /* leave unverified */ }
    }
    results[entry.index] = applyVerification(
      target,
      totals,
      req.base.adults + req.base.children + req.base.infantsInSeat,
    );
  }
  await dbAny.update(flightSearches)
    .set({ status: 'done', completed, result: { pairs: results }, finishedAt: new Date() })
    .where(eq(flightSearches.id, searchId));
  const best = cheapestPairs(results, 1)[0];
  await dbAny.transaction(async (tx) => {
    await recordEvent(tx, {
      tripId: req.tripId, userId: req.userId, verb: 'flights.scan_finished',
      summary: best?.minTotal
        ? `Flight scan finished — cheapest ${money(best.minTotal, best.currency ?? 'USD')} (${best.back ? dateRange(best.depart, best.back) : `${dayLabel(best.depart)}, one way`})`
        : 'Flight scan finished — no priced options found',
      entityType: 'flight_search', entityId: searchId,
    });
  });
}

export async function startScan(
  user: { id: string; name: string; homeTimezone: string },
  tripId: string,
  adultsOnly = false,
) {
  await assertTripRole(tripId, user.id, 'editor');
  // Reuse an in-flight scan that has made progress in the last 5 minutes.
  const recent = await db.select().from(flightSearches)
    .where(and(eq(flightSearches.tripId, tripId), inArray(flightSearches.status, ['queued', 'running'])))
    .orderBy(desc(flightSearches.createdAt)).limit(1);
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < 5 * 60 * 1000) {
    return recent[0];
  }
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError();
  const pairs = candidatePairs(trip.dateStrategy, todayISO(user.homeTimezone), env.FLIGHT_SCAN_MAX_PAIRS);
  if (!pairs.ok) throw new Error(pairs.error);
  const base = {
    originAirports: trip.origin.airports, destinationAirports: trip.destination.airports,
    ...paxFromTrip(trip, adultsOnly),
    cabin: trip.cabin, maxStops: trip.maxStops, currency: trip.currency,
  };
  const request = {
    tripId, userId: user.id, pairs: pairs.pairs, base,
    prefs: { tz: trip.timePrefs.timezone ?? user.homeTimezone, outboundDepart: trip.timePrefs.outboundDepart, returnDepart: trip.timePrefs.returnDepart },
    originTz: trip.origin.timezone, returnTz: trip.destination.timezone, adultsOnly,
  };
  const [row] = await db.insert(flightSearches).values({
    tripId, createdBy: user.id, request, status: 'queued', total: pairs.pairs.length, completed: 0,
  }).returning();
  await db.transaction(async (tx) => {
    await recordEvent(tx, {
      tripId, userId: user.id, verb: 'flights.scan_started',
      summary: `${user.name} started a flight scan (${pairs.pairs.length} date pairs)`,
      entityType: 'flight_search', entityId: row.id,
    });
  });
  after(() => runScan(row.id));
  return row;
}

export async function latestSearch(tripId: string) {
  const rows = await db.select().from(flightSearches)
    .where(eq(flightSearches.tripId, tripId)).orderBy(desc(flightSearches.createdAt)).limit(1);
  return rows[0] ?? null;
}

export async function getSearch(id: string) {
  const rows = await db.select().from(flightSearches).where(eq(flightSearches.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Trip + passenger mix (matching the latest scan) for pair-level fetches. */
async function searchContext(user: { id: string }, tripId: string) {
  await assertTripRole(tripId, user.id, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError();
  const search = await latestSearch(tripId);
  const adultsOnly = (search?.request as { adultsOnly?: boolean } | undefined)?.adultsOnly ?? false;
  const base = {
    originAirports: trip.origin.airports, destinationAirports: trip.destination.airports,
    ...paxFromTrip(trip, adultsOnly),
    cabin: trip.cabin, maxStops: trip.maxStops, currency: trip.currency,
  };
  return { trip, base };
}

/** Fetch (cached) outbounds for a pair — backs the list view route. */
export async function fetchPairOutbounds(
  user: { id: string }, tripId: string, depart: string, back: string | null,
) {
  const { base } = await searchContext(user, tripId);
  return searchOutbounds(
    { ...base, outboundDate: depart, returnDate: back ?? undefined },
    { ttlSeconds: 2 * 60 * 60, tripId, userId: user.id },
  );
}

/** Fetch round-trip itineraries for a pinned outbound — backs the returns route. */
export async function fetchPairReturns(
  user: { id: string }, tripId: string, depart: string, back: string, outboundId: string,
) {
  const { base } = await searchContext(user, tripId);
  const req = { ...base, outboundDate: depart, returnDate: back };
  const opts = { ttlSeconds: 2 * 60 * 60, tripId, userId: user.id };
  const outbounds = await searchOutbounds(req, opts);
  const outbound = outbounds.itineraries.find((i) => i.id === outboundId);
  if (!outbound) throw new NotFoundError();
  return searchReturns(req, outbound, opts);
}

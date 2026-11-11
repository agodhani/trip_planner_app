import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { optionIsActive, optionPriceChecks, tripOptions } from '@/lib/db/schema';
import { toCents } from '@/lib/domain/money';
import {
  canPriceWatch,
  groupByDatePair,
  legIdentityKey,
  priceDelta,
  shouldAlertDrop,
  verdictFor,
  type CheckVerdict,
} from '@/lib/domain/price-watch';
import { searchOutbounds, searchReturns } from '@/lib/providers/googleFlights';
import type { FlightItinerary, FlightSearchRequest } from '@/lib/providers/types';
import { ProviderError } from '@/lib/providers/types';
import { money, plural } from '@/lib/ui-format';
import { assertTripRole, NotFoundError } from './access';
import { recordEvent } from './events';
import { flightRequestBase, latestSearch } from './flights';
import { getTrip } from './trips';

/** Refreshes share the provider cache for 6h — deliberate, documented TTL. */
const CHECK_TTL_SECONDS = 6 * 60 * 60;

export type PriceCheckRow = typeof optionPriceChecks.$inferSelect;

/**
 * Latest check row per option — one grouped query (newest checkedAt wins),
 * so panels attach prices without an N+1.
 */
export async function latestPriceChecks(
  optionIds: string[],
): Promise<Map<string, PriceCheckRow>> {
  const map = new Map<string, PriceCheckRow>();
  if (!optionIds.length) return map;
  const rows = await db
    .select()
    .from(optionPriceChecks)
    .where(inArray(optionPriceChecks.optionId, optionIds))
    .orderBy(asc(optionPriceChecks.optionId), desc(optionPriceChecks.checkedAt));
  for (const r of rows) if (!map.has(r.optionId)) map.set(r.optionId, r);
  return map;
}

export type PriceRefreshResult = {
  /** Active google_flights flight options found. */
  total: number;
  /** Check rows written. */
  checked: number;
  /** Options whose itinerary no longer appears in the results. */
  unavailable: number;
  /** Options down ≥5% vs their shortlist baseline. */
  drops: number;
  /** Watchable options we could not reprice honestly (bad/unresolvable data). */
  skipped: number;
  /** Active flight options from other sources — never re-priced. */
  manualSkipped: number;
  /** Provider failures by date pair; partial success still writes rows. */
  failures: { label: string; kind: string; message: string }[];
};

type ScanPair = { depart: string; back: string | null };

/**
 * Resolve the return date an outbound-only row was priced with. Only an
 * unambiguous depart→back mapping in the latest scan counts — guessing the
 * wrong return date would fabricate a "round trip from" price.
 */
function scanBackDates(
  search: Awaited<ReturnType<typeof latestSearch>>,
): (depart: string) => string | null {
  const pairs =
    ((search?.request as { pairs?: ScanPair[] } | undefined)?.pairs) ?? [];
  return (depart) => {
    const backs = new Set(
      pairs.filter((p) => p.depart === depart).map((p) => p.back ?? ''),
    );
    return backs.size === 1 ? ([...backs][0] || null) : null;
  };
}

const errInfo = (err: unknown) => ({
  kind: err instanceof ProviderError ? err.kind : 'network',
  message: err instanceof Error ? err.message : String(err),
});

/**
 * Re-price every active google_flights flight option. One searchOutbounds
 * call per (depart, back) pair plus one searchReturns per distinct stored
 * outbound; rows are written for what succeeded — a failed pair records no
 * checks rather than guessing "no longer listed". trip_options.priceAmount
 * is never touched: it stays the shortlist-time baseline.
 */
export async function refreshPrices(
  user: { id: string; name: string },
  tripId: string,
): Promise<PriceRefreshResult> {
  await assertTripRole(tripId, user.id, 'editor');
  const [trip, search] = await Promise.all([
    getTrip(tripId),
    latestSearch(tripId),
  ]);
  if (!trip) throw new NotFoundError();
  const adultsOnly =
    (search?.request as { adultsOnly?: boolean } | undefined)?.adultsOnly ??
    false;
  const base = flightRequestBase(trip, adultsOnly);

  const flightOpts = await db
    .select()
    .from(tripOptions)
    .where(
      and(
        eq(tripOptions.tripId, tripId),
        eq(tripOptions.kind, 'flight'),
        optionIsActive,
      ),
    );
  const watchable = flightOpts.filter(canPriceWatch);
  const manualSkipped = flightOpts.length - watchable.length;
  const { groups, skipped } = groupByDatePair(watchable, scanBackDates(search));
  const optById = new Map(watchable.map((o) => [o.id, o]));

  const checks: { optionId: string; verdict: CheckVerdict }[] = [];
  const failures: PriceRefreshResult['failures'] = [];
  let firstErr: unknown = null;
  const opts = { ttlSeconds: CHECK_TTL_SECONDS, tripId, userId: user.id };

  for (const g of groups) {
    const label = g.back ? `${g.depart} → ${g.back}` : `${g.depart} (one way)`;
    const req: FlightSearchRequest = {
      ...base,
      outboundDate: g.depart,
      ...(g.back ? { returnDate: g.back } : {}),
    };
    let outbounds;
    try {
      outbounds = await searchOutbounds(req, opts);
    } catch (err) {
      firstErr ??= err;
      failures.push({ label, ...errInfo(err) });
      continue;
    }
    const byId = new Map(outbounds.itineraries.map((i) => [i.id, i]));
    const byLeg = new Map<string, FlightItinerary>();
    for (const i of outbounds.itineraries) {
      const k = legIdentityKey(i.outbound);
      if (k && !byLeg.has(k)) byLeg.set(k, i);
    }
    // Fresh return listings per distinct stored outbound (null = fetch failed).
    const returnsByKey = new Map<string, FlightItinerary[] | null>();
    for (const o of g.options) {
      const data = o.data as {
        id?: unknown;
        outbound?: unknown;
        return?: unknown;
      };
      const wantId = typeof data.id === 'string' && data.id ? data.id : null;
      if (!wantId) {
        skipped.push(o);
        continue;
      }
      let itin: FlightItinerary | undefined;
      if (data.return) {
        // Round-trip option: pin the stored outbound, then match the return.
        const outKey = legIdentityKey(data.outbound);
        const fresh = outKey ? byLeg.get(outKey) : undefined;
        if (fresh && outKey) {
          let rets = returnsByKey.get(outKey);
          if (rets === undefined) {
            try {
              rets = (
                await searchReturns({ ...req, returnDate: g.back! }, fresh, opts)
              ).itineraries;
            } catch (err) {
              firstErr ??= err;
              failures.push({ label: `${label} returns`, ...errInfo(err) });
              rets = null;
            }
            returnsByKey.set(outKey, rets);
          }
          if (rets === null) continue; // couldn't check — no row, no guess
          itin = rets.find((i) => i.id === wantId);
        }
        // !fresh → the outbound itself is gone → "no longer listed".
      } else {
        itin = byId.get(wantId);
      }
      checks.push({ optionId: o.id, verdict: verdictFor(itin) });
    }
  }

  // Drops vs the frozen shortlist baseline — only when currencies agree.
  const drops: {
    optionId: string;
    title: string;
    baselineCents: number;
    checkCents: number;
    currency: string;
  }[] = [];
  for (const c of checks) {
    if (!c.verdict.available || c.verdict.priceCents === null) continue;
    const opt = optById.get(c.optionId)!;
    if (opt.priceAmount === null) continue;
    const baselineCur = opt.priceCurrency ?? trip.currency;
    if (c.verdict.currency !== baselineCur) continue;
    const baselineCents = toCents(Number(opt.priceAmount));
    const d = priceDelta(baselineCents, c.verdict.priceCents);
    if (shouldAlertDrop(d.pct)) {
      drops.push({
        optionId: c.optionId,
        title: opt.title,
        baselineCents,
        checkCents: c.verdict.priceCents,
        currency: baselineCur,
      });
    }
  }

  if (checks.length === 0) {
    // Nothing recorded — surface the provider failure, not a fake success.
    if (firstErr) throw firstErr;
    return {
      total: watchable.length,
      checked: 0,
      unavailable: 0,
      drops: 0,
      skipped: skipped.length,
      manualSkipped,
      failures,
    };
  }

  await db.transaction(async (tx) => {
    await tx.insert(optionPriceChecks).values(
      checks.map((c) => ({
        optionId: c.optionId,
        priceCents: c.verdict.priceCents,
        currency: c.verdict.currency,
        available: c.verdict.available,
      })),
    );
    const unavailable = checks.filter((c) => !c.verdict.available).length;
    await recordEvent(tx, {
      tripId,
      userId: user.id,
      verb: 'flights.prices_checked',
      summary:
        `${user.name} refreshed prices for ${plural(checks.length, 'shortlisted flight')}` +
        (unavailable ? ` — ${unavailable} no longer listed` : ''),
      entityType: 'trip',
      entityId: tripId,
    });
    for (const d of drops) {
      await recordEvent(tx, {
        tripId,
        userId: user.id,
        verb: 'flights.price_drop',
        summary: `${money(d.baselineCents / 100, d.currency)} → ${money(d.checkCents / 100, d.currency)} on ${d.title}`,
        entityType: 'option',
        entityId: d.optionId,
      });
    }
  });

  return {
    total: watchable.length,
    checked: checks.length,
    unavailable: checks.filter((c) => !c.verdict.available).length,
    drops: drops.length,
    skipped: skipped.length,
    manualSkipped,
    failures,
  };
}

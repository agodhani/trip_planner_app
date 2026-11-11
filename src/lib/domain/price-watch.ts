/**
 * Price Watch: pure logic for re-pricing shortlisted flight options.
 * The option's priceAmount stays the shortlist-time baseline; every refresh
 * appends an option_price_checks row describing what the provider shows now.
 * No I/O — unit-tested.
 */

/** The only provider we can re-price: manual/other options are skipped. */
export const PRICE_WATCH_SOURCE = 'google_flights';

/** A drop at or beyond this percent vs the baseline raises flights.price_drop. */
export const DROP_ALERT_PCT = 5;

export function canPriceWatch(o: { kind: string; source: string }): boolean {
  return o.kind === 'flight' && o.source === PRICE_WATCH_SOURCE;
}

/**
 * Latest minus baseline, in integer cents. pct is null when the baseline is
 * zero (a percent off nothing is meaningless) — callers must treat null as
 * "unknown", not as "no change".
 */
export function priceDelta(
  baselineCents: number,
  latestCents: number,
): { cents: number; pct: number | null } {
  const cents = latestCents - baselineCents;
  return {
    cents,
    pct: baselineCents > 0 ? (cents / baselineCents) * 100 : null,
  };
}

/** True only for a real drop at or beyond DROP_ALERT_PCT. */
export function shouldAlertDrop(pct: number | null | undefined): boolean {
  return pct !== null && pct !== undefined && pct <= -DROP_ALERT_PCT;
}

export type DatePair = { depart: string; back: string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

type WatchData = {
  id?: string;
  outbound?: { departLocal?: string; segments?: unknown };
  return?: { departLocal?: string };
  price?: { isFrom?: boolean };
};

/**
 * The (depart, return) pair a stored itinerary was priced for, taken from the
 * legs themselves. Null when the stored data is malformed — such options are
 * skipped, never guessed.
 */
export function optionDatePair(data: unknown): DatePair | null {
  const d = data as WatchData | null | undefined;
  const depart = d?.outbound?.departLocal?.slice(0, 10);
  if (!depart || !DAY.test(depart)) return null;
  const back = d?.return?.departLocal?.slice(0, 10);
  return { depart, back: back && DAY.test(back) ? back : null };
}

/** Stored itinerary is an outbound-only row priced as "round trip from …". */
export function isFromRoundTripSearch(data: unknown): boolean {
  const d = data as WatchData | null | undefined;
  return !d?.return && d?.price?.isFrom === true;
}

/**
 * Identity of a leg = its segments, same formula the provider hashes into
 * FlightItinerary.id — used to pin a stored outbound against fresh results
 * without importing the provider's crypto.
 */
export function legIdentityKey(leg: unknown): string | null {
  const l = leg as
    | { segments?: { airlineCode?: string; flightNumber?: string; departLocal?: string }[] }
    | null
    | undefined;
  if (!l?.segments || l.segments.length === 0) return null;
  return l.segments
    .map((s) => `${s.airlineCode ?? ''}${s.flightNumber ?? ''}@${s.departLocal ?? ''}`)
    .join('|');
}

export type WatchGroup<T> = DatePair & { options: T[] };

/**
 * Bucket watchable options by their stored (depart, back) pair so one
 * provider call reprices every option shortlisted under the same dates.
 *
 * An outbound-only row whose price was "round trip from" (isFrom) needs the
 * return date it was priced with; `resolveBack` supplies it from the search
 * context. When it can't be resolved — or the data is malformed — the option
 * lands in `skipped` rather than being repriced against the wrong pair.
 */
export function groupByDatePair<T extends { data: unknown }>(
  options: T[],
  resolveBack?: (depart: string) => string | null,
): { groups: WatchGroup<T>[]; skipped: T[] } {
  const byKey = new Map<string, WatchGroup<T>>();
  const skipped: T[] = [];
  for (const o of options) {
    const pair = optionDatePair(o.data);
    if (!pair) {
      skipped.push(o);
      continue;
    }
    let back = pair.back;
    if (!back && isFromRoundTripSearch(o.data)) {
      const resolved = resolveBack?.(pair.depart);
      if (!resolved) {
        skipped.push(o);
        continue;
      }
      back = resolved;
    }
    const key = `${pair.depart}|${back ?? ''}`;
    let g = byKey.get(key);
    if (!g) {
      g = { depart: pair.depart, back, options: [] };
      byKey.set(key, g);
    }
    g.options.push(o);
  }
  return { groups: [...byKey.values()], skipped };
}

/** What one refresh row says about an option. */
export type CheckVerdict = {
  /** false = the itinerary no longer appears in the provider's results. */
  available: boolean;
  /** null = still listed but currently unpriced (or gone). */
  priceCents: number | null;
  currency: string | null;
};

/**
 * Verdict for one option given the itinerary that matched it (or undefined
 * when the id is absent from the fresh results — "no longer listed").
 */
export function verdictFor(
  itin:
    | { id?: string; price: { total: number | null; currency: string } }
    | undefined,
): CheckVerdict {
  if (!itin) return { available: false, priceCents: null, currency: null };
  return {
    available: true,
    priceCents: itin.price.total !== null ? Math.round(itin.price.total * 100) : null,
    currency: itin.price.currency,
  };
}

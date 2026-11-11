/**
 * Group availability on candidate date pairs ("which weekend works for
 * everyone?"). Pure logic — unit-tested, no I/O.
 *
 * Pairs are strategy-derived {depart, back} strings, not DB rows; a one-way
 * pair has back = null. Members mark their own availability per pair —
 * travelers without accounts can't respond (the UI copy says so), and
 * members who haven't responded count as uncommitted, never implied.
 */

export type PairAvail = 'works' | 'maybe' | 'no';

export type PairRef = { depart: string; back: string | null };

export type DatePairPref = PairRef & { userId: string; value: PairAvail };

/** Stable pair identifier — also the date_pair_prefs entityId. */
export function pairId(pair: PairRef): string {
  return `${pair.depart}|${pair.back ?? ''}`;
}

export type PairAggregate = {
  works: number;
  maybe: number;
  no: number;
  /** Members who marked anything on this pair (≤ memberCount). */
  responded: number;
  /** Members who could respond — the rest are uncommitted. */
  memberCount: number;
};

/**
 * Per-pair tallies keyed by pairId. Coverage is honest: `responded` counts
 * actual marks, and `memberCount - responded` are members who haven't said
 * anything — they must never be folded into a guess.
 */
export function aggregatePrefs(
  prefs: DatePairPref[],
  memberCount: number,
): Map<string, PairAggregate> {
  const map = new Map<string, PairAggregate>();
  for (const p of prefs) {
    const key = pairId(p);
    const agg =
      map.get(key) ?? { works: 0, maybe: 0, no: 0, responded: 0, memberCount };
    agg[p.value] += 1;
    agg.responded += 1;
    map.set(key, agg);
  }
  return map;
}

export type RankedPair = PairRef & {
  /** Lowest round-trip total for the pair; null sorts last. */
  price: number | null;
};

/**
 * Best date pair for the group: most 'works', then fewest 'no', then
 * cheapest (unpriced pairs last). Returns the winning pairId, or null when
 * nobody has responded — we never fabricate a winner.
 */
export function bestForGroup(
  pairs: RankedPair[],
  prefs: DatePairPref[],
): string | null {
  if (!prefs.length) return null;
  const aggregates = aggregatePrefs(prefs, 0);
  const scored = pairs.map((p) => ({
    p,
    agg: aggregates.get(pairId(p)) ?? {
      works: 0,
      maybe: 0,
      no: 0,
      responded: 0,
      memberCount: 0,
    },
  }));
  // Marks on pairs outside this candidate set (e.g. a stale scan) don't
  // count as a response — there's still nothing to rank on.
  if (!scored.some((s) => s.agg.responded > 0)) return null;
  scored.sort(
    (a, b) =>
      b.agg.works - a.agg.works ||
      a.agg.no - b.agg.no ||
      (a.p.price ?? Infinity) - (b.p.price ?? Infinity) ||
      a.p.depart.localeCompare(b.p.depart) ||
      (a.p.back ?? '').localeCompare(b.p.back ?? ''),
  );
  return pairId(scored[0].p);
}

/**
 * Names of members who marked `pair` as can't-go — shown as a non-blocking
 * heads-up when someone anchors those dates. null when nobody objected.
 */
export function selectionWarning(
  pair: PairRef,
  prefs: DatePairPref[],
  members: { userId: string; name: string }[],
): string[] | null {
  const names = new Map(members.map((m) => [m.userId, m.name]));
  const key = pairId(pair);
  const noes = prefs
    .filter((p) => pairId(p) === key && p.value === 'no')
    .map((p) => names.get(p.userId))
    .filter((n): n is string => !!n);
  return noes.length ? noes : null;
}

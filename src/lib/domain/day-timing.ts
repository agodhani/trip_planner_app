/**
 * Pure day-board helpers: which consecutive hops still need a route leg, and
 * whether the chosen leg fits the gap between timed items. No I/O — shared by
 * the board (client) and the leg sync (server).
 *
 * "Never warn on unknown": missing coordinates, missing times, or a leg
 * without a stored duration produce no output rather than a guess.
 */

export type LocatedItem = { id: string; lat?: number | null; lon?: number | null };

export type TimingItem = {
  id: string;
  startTime: string | null;
  endTime?: string | null;
  durationMin?: number | null;
};

export type LegRef = {
  fromItemId: string;
  toItemId: string;
  durationMin: number | null;
  chosen?: boolean;
};

export type Pair<T> = { from: T; to: T };

export type TightHop = {
  fromId: string;
  toId: string;
  /** Travel minutes the stored leg needs. */
  neededMin: number;
  /** Minutes between the previous item's end and the next item's start (can be negative when items overlap). */
  availableMin: number;
};

const located = (i: LocatedItem) => i.lat != null && i.lon != null;

/** Consecutive pairs of a day's ordered items where both ends have coordinates. */
export function locatedPairs<T extends LocatedItem>(items: T[]): Pair<T>[] {
  const out: Pair<T>[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    if (located(items[i]) && located(items[i + 1])) out.push({ from: items[i], to: items[i + 1] });
  }
  return out;
}

/** Pairs with no stored leg of any mode — the set an auto-sync should compute. */
export function missingLegPairs<P extends Pair<{ id: string }>, L extends Pick<LegRef, 'fromItemId' | 'toItemId'>>(
  pairs: P[],
  legs: L[],
): P[] {
  const have = new Set(legs.map((l) => `${l.fromItemId}|${l.toItemId}`));
  return pairs.filter((p) => !have.has(`${p.from.id}|${p.to.id}`));
}

/** 'HH:mm[:ss]' → minutes, or null when absent/unparseable. */
const mins = (t: string | null | undefined): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Flags hops where the gap between the previous item's end and the next
 * item's start is shorter than the chosen leg's travel time. `items` must be
 * in display order (orderDay) for one day.
 *
 * Previous end = endTime, else startTime + durationMin, else startTime alone.
 * An endTime at-or-before startTime reads as after midnight; a next start
 * before the previous start reads as the following morning.
 */
export function dayTiming<T extends TimingItem>(items: T[], legs: LegRef[]): TightHop[] {
  const flags: TightHop[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const prev = items[i];
    const next = items[i + 1];
    const leg = legs.find((l) => l.fromItemId === prev.id && l.toItemId === next.id && l.chosen)
      ?? legs.find((l) => l.fromItemId === prev.id && l.toItemId === next.id);
    if (!leg || leg.durationMin == null) continue;
    const prevStart = mins(prev.startTime);
    let nextStart = mins(next.startTime);
    if (prevStart == null || nextStart == null) continue;
    const prevEndRaw = prev.endTime ? mins(prev.endTime) : null;
    const prevEnd = prevEndRaw != null
      ? prevEndRaw + (prevEndRaw <= prevStart ? 1440 : 0)
      : prev.durationMin != null
        ? prevStart + prev.durationMin
        : prevStart;
    if (nextStart < prevStart) nextStart += 1440;
    const available = nextStart - prevEnd;
    if (available < leg.durationMin) {
      flags.push({ fromId: prev.id, toId: next.id, neededMin: leg.durationMin, availableMin: available });
    }
  }
  return flags;
}

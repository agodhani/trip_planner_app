import { haversineKm, type GeoPoint } from './geo';

/** 'YYYY-MM-DD' + n days (UTC math — dates have no tz). */
export function plusDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** '3:00 PM' / '11 AM' / '15:00' → '15:00' / '11:00' / '15:00'; undefined if unparseable. */
export function to24h(s: string | null | undefined): string | undefined {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*$/i.exec(s ?? '');
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

type DayItem = { id: string; kind: string; startTime: string | null; sortOrder: number };

/**
 * Display/route order within one day: chronological by start time; untimed
 * items sit around midday in the order added. Domain rules: you check out
 * before your flight leaves and check in after you land.
 */
export function orderDay<T extends DayItem>(items: T[]): T[] {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const timesOf = (kind: string) => items.filter((i) => i.kind === kind && i.startTime).map((i) => mins(i.startTime!));
  const departs = timesOf('flight_depart'), arrives = timesOf('flight_arrive');
  const key = (i: T) => {
    let m = i.startTime ? mins(i.startTime) : 12 * 60 + 0.5;
    if (i.kind === 'checkout' && departs.length) m = Math.min(m, Math.min(...departs) - 0.25);
    if (i.kind === 'checkin' && arrives.length) m = Math.max(m, Math.max(...arrives) + 0.25);
    return m;
  };
  return [...items].sort((a, b) => key(a) - key(b) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

const MIN_MIN = 5 * 60; // 05:00
const MAX_MIN = 23 * 60 + 45; // 23:45

const fmtMins = (m: number): string => {
  const h = Math.floor(m / 60);
  const mi = Math.floor(m % 60);
  const s = Math.round((m - Math.floor(m)) * 60);
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}${s ? `:${String(s).padStart(2, '0')}` : ''}`;
};

export type DropResult = {
  day: string | null;
  startTime: string | null;
  sortOrder: number;
  /** Renumbered sibling sortOrders (id → new sortOrder), when normalization was needed. */
  siblings?: { id: string; sortOrder: number }[];
};

/**
 * Where a dropped card should land so the column's orderDay() order equals the
 * order the user sees. `items` are the target column's items (any order),
 * `targetIndex` the insertion slot among the column's items excluding the
 * dragged one — i.e. the index of the card it was dropped on (or the column
 * length for a drop on empty space).
 *
 * Rules: between two timed items the card takes the midpoint time (snapped to
 * :00/:15/:30/:45; below a 15-minute gap the raw midpoint is used and
 * sortOrder breaks the tie). Any other slot keeps it untimed and relies on
 * sortOrder. Edge slots use prev+60min / next−60min clamped to 05:00–23:45.
 * Anchors (system/locked) are never modified — only their neighbour values
 * are read; the dropped item always lands between them, never on them.
 */
export function computeDrop<T extends DayItem>(
  items: T[],
  itemId: string,
  targetDay: string | null,
  targetIndex: number,
): DropResult {
  const rest = orderDay(items.filter((i) => i.id !== itemId));
  const k = Math.max(0, Math.min(targetIndex, rest.length));
  const prev = k > 0 ? rest[k - 1] : undefined;
  const next = k < rest.length ? rest[k] : undefined;

  // Slot sortOrder: renumber the column ×10 so the dragged item always fits
  // between its neighbours (prev = k*10, next = (k+1)*10 → k*10+5).
  const renumbered = rest.map((r, i) => (i + 1) * 10);
  const needsRenumber = rest.some((r, i) => r.sortOrder !== renumbered[i]);
  const siblings = needsRenumber ? rest.map((r, i) => ({ id: r.id, sortOrder: renumbered[i] })) : undefined;
  const sortOrder = needsRenumber ? k * 10 + 5
    : prev && next ? Math.floor((prev.sortOrder + next.sortOrder) / 2)
    : prev ? prev.sortOrder + 10
    : next ? next.sortOrder - 10
    : 10;
  // If the non-renumbered midpoint collides (adjacent or equal sortOrders),
  // fall back to the renumbered scheme so the item lands exactly at k.
  const midClash = !needsRenumber && prev && next && next.sortOrder - prev.sortOrder < 2;
  const final = midClash
    ? { sortOrder: k * 10 + 5, siblings: rest.map((r, i) => ({ id: r.id, sortOrder: (i + 1) * 10 })) as DropResult['siblings'] }
    : { sortOrder, siblings };

  const minsOf = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const prevM = prev ? minsOf(prev.startTime) : null;
  const nextM = next ? minsOf(next.startTime) : null;

  let startTime: string | null = null;
  if (prev && next) {
    if (prevM !== null && nextM !== null) {
      const gap = nextM - prevM;
      const mid = (prevM + nextM) / 2;
      // Snap to quarter hours when there is room; otherwise the raw midpoint
      // (or a boundary collision) is fine — sortOrder keeps it at slot k.
      const snapped = gap >= 15 ? Math.round(mid / 15) * 15 : mid;
      startTime = fmtMins(Math.max(MIN_MIN, Math.min(MAX_MIN, snapped)));
    }
    // Mixed neighbours (one timed, one untimed): stay untimed — orderDay only
    // ever shows this boundary at the untimed cluster's edge, where an untimed
    // card lands exactly at slot k.
  } else if (prevM !== null) {
    startTime = fmtMins(Math.min(MAX_MIN, prevM + 60));
  } else if (nextM !== null) {
    startTime = fmtMins(Math.max(MIN_MIN, nextM - 60));
  }
  return { day: targetDay, startTime, sortOrder: final.sortOrder, siblings: final.siblings };
}

/**
 * Days where auto-arrange may place destination activities: from the first
 * arrival at the destination to the last departure back, intersected with the
 * trip's days. With no flight anchors every trip day is fair game.
 */
export function arrangeableDays(days: string[], anchors: { kind: string; day: string }[]): string[] {
  const arrives = anchors.filter((a) => a.kind === 'flight_arrive').map((a) => a.day).sort();
  const departs = anchors.filter((a) => a.kind === 'flight_depart').map((a) => a.day).sort();
  const lo = arrives[0];
  const hi = departs[departs.length - 1];
  if (lo === undefined && hi === undefined) return days;
  return days.filter((d) => (lo === undefined || d >= lo) && (hi === undefined || d <= hi));
}

/** Inclusive day list start..end (capped). */
export function dayList(start: string, end: string, maxDays = 45): string[] {
  const out: string[] = [];
  for (let d = start, i = 0; d <= end && i < maxDays; d = plusDays(d, 1), i++) out.push(d);
  return out;
}

export type AnchorSpec = {
  kind: 'flight_depart' | 'flight_arrive' | 'checkin' | 'checkout';
  day: string;
  time?: string; // 'HH:mm'
  title: string;
  lat?: number; lon?: number;
  optionId?: string;
  anchorKey: string; // unique per source for idempotent sync
};

/** Greedy day assignment: each item goes to the day whose running centroid
 * is nearest (seeded by the day's anchor point), up to `perDay` items. Items
 * without coordinates fill the emptiest days. Locked/manual assignments
 * are untouched — this only orders the returned `assignments`. */
export function autoAssign<T extends { id: string; lat?: number | null; lon?: number | null; avoidDays?: string[] }>(
  days: { day: string; anchor: GeoPoint | null; capacity: number }[],
  items: T[],
): Map<string, string[]> {
  const remaining = new Map(days.map((d) => [d.day, d.capacity]));
  const points = new Map<string, GeoPoint[]>(
    days.map((d) => [d.day, d.anchor ? [d.anchor] : []]),
  );
  const out = new Map<string, string[]>(days.map((d) => [d.day, []]));

  const centroidOf = (day: string): GeoPoint | null => {
    const ps = points.get(day) ?? [];
    if (!ps.length) return null;
    return {
      lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length,
      lon: ps.reduce((s, p) => s + p.lon, 0) / ps.length,
    };
  };

  // Furthest-apart items first so clusters form naturally.
  const sorted = [...items].sort((a, b) => (b.lat != null ? 1 : 0) - (a.lat != null ? 1 : 0));
  for (const it of sorted) {
    const avoid = new Set(it.avoidDays ?? []);
    let best: string | null = null;
    let bestScore = Infinity;
    let fallback: string | null = null;
    let fallbackScore = Infinity;
    for (const d of days) {
      if ((remaining.get(d.day) ?? 0) <= 0) continue;
      const c = centroidOf(d.day);
      const dist =
        it.lat != null && it.lon != null && c
          ? haversineKm(it.lat, it.lon, c.lat, c.lon)
          : 50 - (out.get(d.day)?.length ?? 0); // unlocated → emptiest day
      const dayLoad = (out.get(d.day)?.length ?? 0);
      const score = dist + dayLoad * 2;
      if (score < fallbackScore) { fallbackScore = score; fallback = d.day; }
      // Closed days are only a preference: if every day is avoided the item
      // still gets placed, just on the best remaining day.
      if (avoid.has(d.day)) continue;
      if (score < bestScore) { bestScore = score; best = d.day; }
    }
    const pick = best ?? fallback;
    if (!pick) break;
    out.get(pick)!.push(it.id);
    remaining.set(pick, (remaining.get(pick) ?? 1) - 1);
    if (it.lat != null && it.lon != null) points.get(pick)!.push({ lat: it.lat, lon: it.lon });
  }

  // Order within a day by nearest-neighbour walk from the anchor.
  for (const d of days) {
    const ids = out.get(d.day) ?? [];
    const byId = new Map(items.map((i) => [i.id, i]));
    const ordered: string[] = [];
    let cur = d.anchor;
    const pool = [...ids];
    while (pool.length) {
      let pick = 0, best = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const it = byId.get(pool[i]);
        const dist = it?.lat != null && it?.lon != null && cur
          ? haversineKm(it.lat!, it.lon!, cur.lat, cur.lon)
          : 999;
        if (dist < best) { best = dist; pick = i; }
      }
      const id = pool.splice(pick, 1)[0];
      ordered.push(id);
      const it = byId.get(id);
      if (it?.lat != null && it?.lon != null) cur = { lat: it.lat!, lon: it.lon! };
    }
    out.set(d.day, ordered);
  }
  return out;
}

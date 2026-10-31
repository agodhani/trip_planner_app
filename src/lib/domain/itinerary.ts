import { haversineKm, type GeoPoint } from './geo';

/** 'YYYY-MM-DD' + n days (UTC math — dates have no tz). */
export function plusDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
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
export function autoAssign<T extends { id: string; lat?: number | null; lon?: number | null }>(
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
    let best: string | null = null;
    let bestScore = Infinity;
    for (const d of days) {
      if ((remaining.get(d.day) ?? 0) <= 0) continue;
      const c = centroidOf(d.day);
      const dist =
        it.lat != null && it.lon != null && c
          ? haversineKm(it.lat, it.lon, c.lat, c.lon)
          : 50 - (out.get(d.day)?.length ?? 0); // unlocated → emptiest day
      const dayLoad = (out.get(d.day)?.length ?? 0);
      const score = dist + dayLoad * 2;
      if (score < bestScore) { bestScore = score; best = d.day; }
    }
    if (!best) break;
    out.get(best)!.push(it.id);
    remaining.set(best, (remaining.get(best) ?? 1) - 1);
    if (it.lat != null && it.lon != null) points.get(best)!.push({ lat: it.lat, lon: it.lon });
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

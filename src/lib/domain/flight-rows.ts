/** Pure helpers for flight result rows — shared with unit tests. */

export type LegLike = {
  from: { code: string };
  to: { code: string };
  departLocal: string;
  arriveLocal: string;
  durationMin: number;
  stops: number;
  segments: { departLocal: string }[];
  layovers: { airportCode: string; durationMin: number }[];
  airlines: string[];
};

/** One bad provider row must never crash the results table. */
export function isWellFormedLeg(l: unknown): boolean {
  const leg = l as LegLike | null | undefined;
  return !!leg
    && typeof leg.from?.code === 'string' && typeof leg.to?.code === 'string'
    && typeof leg.departLocal === 'string' && typeof leg.arriveLocal === 'string'
    && Number.isFinite(leg.durationMin)
    && Array.isArray(leg.segments) && leg.segments.length > 0
    && Array.isArray(leg.layovers)
    && Array.isArray(leg.airlines);
}

export function isWellFormedItin(it: unknown): boolean {
  const i = it as { outbound?: unknown; return?: unknown } | null | undefined;
  return isWellFormedLeg(i?.outbound) && (i?.return === undefined || isWellFormedLeg(i.return));
}

/** Dedupe key for a shortlisted flight — shared by the action and the UI. */
export function flightKey(it: { id: string; outbound: { departLocal: string }; return?: { departLocal?: string } }) {
  return `${it.id}:${it.outbound.departLocal.slice(0, 10)}:${it.return?.departLocal?.slice(0, 10) ?? ''}`;
}

export function fmtMin(min: number) {
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function hhmm(local: string) {
  return local.slice(11, 16);
}

/** +1 marker when arrival date differs from the first segment's depart date. */
export function plusOne(local: string, segs: { departLocal: string }[]) {
  const first = segs[0]?.departLocal;
  if (!first) return '';
  return local.slice(0, 10) !== first.slice(0, 10) ? ' +1' : '';
}

export function stopsLabel(leg: LegLike) {
  return leg.stops === 0
    ? 'nonstop'
    : `${leg.stops} stop${leg.stops > 1 ? 's' : ''} ${leg.layovers.map((l) => l.airportCode).join(', ')}`;
}

export const OVERNIGHT_LAYOVER_MIN = 180;
export const SHORT_CONNECTION_MIN = 60;
export const LONG_LAYOVER_MIN = 360;

/** CO₂e vs the route's typical flight — pct is null when Google gives no typical. */
export function emissionsInfo(leg: { emissionsKg?: number; typicalEmissionsKg?: number }): {
  kg: number; pct: number | null; vsTypical: string | null;
} | null {
  const kg = leg.emissionsKg;
  if (kg === undefined || !Number.isFinite(kg) || kg <= 0) return null;
  const typical = leg.typicalEmissionsKg;
  const pct = typical !== undefined && typical > 0
    ? Math.round(((kg - typical) / typical) * 100)
    : null;
  const vsTypical = pct === null
    ? null
    : pct < 0
      ? `${-pct}% below typical`
      : pct > 0
        ? `${pct}% above typical`
        : 'typical for this route';
  return { kg, pct, vsTypical };
}

export type LayoverFlag = { kind: 'airport_change' | 'overnight' | 'short' | 'long'; label: string };

export function layoverFlags(l: {
  airportCode: string; durationMin: number; overnight?: boolean; departAirportCode?: string;
}): LayoverFlag[] {
  const flags: LayoverFlag[] = [];
  if (l.departAirportCode) {
    flags.push({ kind: 'airport_change', label: `Change airports ${l.airportCode} → ${l.departAirportCode}` });
  }
  const overnight = l.overnight === true && l.durationMin >= OVERNIGHT_LAYOVER_MIN;
  if (overnight) flags.push({ kind: 'overnight', label: 'Overnight' });
  if (l.durationMin < SHORT_CONNECTION_MIN) {
    flags.push({ kind: 'short', label: 'Short connection' });
  } else if (l.durationMin >= LONG_LAYOVER_MIN && !overnight) {
    flags.push({ kind: 'long', label: 'Long layover' });
  }
  return flags;
}

/** '31 inches' / '31 in' → '31 in legroom'; other text → '<text> legroom'. */
export function legroomLabel(s?: string): string | null {
  if (!s || !s.trim()) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(?:inches|in)$/i.exec(s.trim());
  return m ? `${m[1]} in legroom` : `${s.trim()} legroom`;
}

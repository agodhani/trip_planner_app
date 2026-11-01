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

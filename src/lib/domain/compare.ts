/**
 * Side-by-side compare rows for shortlisted options — pure builders shared by
 * the compare sheet and unit tests. Everything comes from trip_options.data
 * (already-saved provider/manual payloads): missing or malformed values render
 * '—' and are never invented. `best` is only marked when at least two options
 * report a comparable value; ties all win.
 */

import { dayLabel, money, nightsBetween } from '@/lib/ui-format';
import {
  emissionsInfo,
  fmtMin,
  hhmm,
  isWellFormedLeg,
  layoverFlags,
  legroomLabel,
  plusOne,
  stopsLabel,
  type LegLike,
} from './flight-rows';
import { weekSummary } from './opening-hours';

export type CompareOption = {
  id: string;
  title: string;
  subtitle?: string | null;
  price?: number | null;
  currency?: string | null;
  data?: unknown;
};

export type CompareCell = { text: string; best?: boolean };
export type CompareRow = { label: string; cells: CompareCell[] };

type Obj = Record<string, unknown>;

/** Intermediate cell: display text plus the number used for best-marking. */
type RawCell = { text: string | null; value?: number | null };

export type CompareCtx = {
  /** Amenity strings present on every compared lodging option. */
  shared: Set<string>;
  /** At least one compared option reported amenities. */
  anyAmenities: boolean;
};

/**
 * One attribute row: `cell` reads a single option's data object (null-safe —
 * data is arbitrary jsonb); `better` decides which direction wins the row.
 */
export type CompareField = {
  label: string;
  better?: 'lower' | 'higher';
  cell: (d: Obj | null, o: CompareOption, ctx: CompareCtx) => RawCell;
};

const asObj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * One flag per cell — true marks the row's best. Needs ≥2 finite values: a
 * single reported value says nothing about the options that didn't report.
 */
export function bestCell(values: (number | null)[], better: 'lower' | 'higher'): boolean[] {
  const usable = values.map((v) => (v !== null && Number.isFinite(v) ? v : null));
  const finite = usable.filter((v): v is number => v !== null);
  if (finite.length < 2) return usable.map(() => false);
  const best = better === 'lower' ? Math.min(...finite) : Math.max(...finite);
  return usable.map((v) => v === best);
}

const moneyText = (amount: number, currency: string | null): string =>
  money(amount, currency ?? 'USD', Number.isInteger(amount) ? 0 : 2);

const countText = (n: number, word: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? word : `${word}s`}`;

// ----- flight -----

type DataLeg = LegLike & { emissionsKg?: number; typicalEmissionsKg?: number };

const flightLeg = (d: Obj | null, key: 'outbound' | 'return'): DataLeg | null =>
  isWellFormedLeg(d?.[key]) ? (d![key] as DataLeg) : null;

/** 'Fri, Dec 4 · 20:15 JFK → 08:00 +1 LIS · 11h 45m' */
const legTimeLine = (leg: LegLike): string =>
  `${dayLabel(leg.departLocal)} · ${hhmm(leg.departLocal)} ${leg.from.code} → ` +
  `${hhmm(leg.arriveLocal)}${plusOne(leg.arriveLocal, leg.segments)} ${leg.to.code} · ` +
  fmtMin(leg.durationMin);

/** 'nonstop' or '1 stop · MAD 2h 10m (Long layover)' — layover detail per stop. */
const stopsSummary = (leg: LegLike): string => {
  if (leg.stops === 0 || !leg.layovers.length) return stopsLabel(leg);
  const lays = leg.layovers.map((l) => {
    const rec = asObj(l) ?? {};
    const code = str(rec.airportCode) ?? '?';
    const mins = num(rec.durationMin);
    if (mins === null) return code;
    const flags = layoverFlags({
      airportCode: code,
      durationMin: mins,
      overnight: rec.overnight === true,
      departAirportCode: str(rec.departAirportCode) ?? undefined,
    }).map((f) => f.label);
    return `${code} ${fmtMin(mins)}${flags.length ? ` (${flags.join(', ')})` : ''}`;
  });
  const n = num(leg.stops) ?? lays.length;
  return `${n} stop${n === 1 ? '' : 's'} · ${lays.join(' · ')}`;
};

const legField = (key: 'outbound' | 'return', label: string): CompareField => ({
  label,
  better: 'lower',
  cell: (d) => {
    const leg = flightLeg(d, key);
    return leg ? { text: legTimeLine(leg), value: leg.durationMin } : { text: null };
  },
});

const FLIGHT_FIELDS: CompareField[] = [
  {
    label: 'Total price',
    better: 'lower',
    cell: (d, o) => {
      const p = asObj(d?.price);
      const total = num(p?.total) ?? o.price ?? null;
      if (total === null) return { text: null };
      const text = moneyText(total, str(p?.currency) ?? o.currency ?? 'USD');
      return { text: p?.isFrom === true ? `from ${text}` : text, value: total };
    },
  },
  {
    label: 'Per person',
    better: 'lower',
    cell: (d, o) => {
      const p = asObj(d?.price);
      const pp = num(p?.perPerson);
      if (pp === null) return { text: null };
      return { text: moneyText(pp, str(p?.currency) ?? o.currency ?? 'USD'), value: pp };
    },
  },
  legField('outbound', 'Outbound'),
  legField('return', 'Return'),
  {
    label: 'Stops',
    better: 'lower',
    cell: (d) => {
      const out = flightLeg(d, 'outbound');
      const back = flightLeg(d, 'return');
      if (!out && !back) return { text: null };
      const text = out && back
        ? `Out: ${stopsSummary(out)} · Back: ${stopsSummary(back)}`
        : stopsSummary((out ?? back)!);
      return { text, value: (out?.stops ?? 0) + (back?.stops ?? 0) };
    },
  },
  {
    label: 'Airlines',
    cell: (d) => {
      const names = new Set<string>();
      for (const leg of [flightLeg(d, 'outbound'), flightLeg(d, 'return')]) {
        if (!leg) continue;
        let legHasNames = false;
        for (const s of leg.segments) {
          const seg = asObj(s);
          const n = str(seg?.airlineName) ?? str(seg?.airlineCode);
          if (n) { names.add(n); legHasNames = true; }
        }
        // Segment names absent (sparse payloads) → fall back to the leg's codes.
        if (!legHasNames) {
          for (const a of leg.airlines) { const n = str(a); if (n) names.add(n); }
        }
      }
      return { text: names.size ? [...names].join(', ') : null };
    },
  },
  {
    label: 'Emissions',
    better: 'lower',
    cell: (d) => {
      const out = flightLeg(d, 'outbound');
      const back = flightLeg(d, 'return');
      const textOf = (em: ReturnType<typeof emissionsInfo>) =>
        em ? `${em.kg} kg CO₂e${em.vsTypical ? ` · ${em.vsTypical}` : ''}` : null;
      const outText = out ? textOf(emissionsInfo(out)) : null;
      const backText = back ? textOf(emissionsInfo(back)) : null;
      if (outText === null && backText === null) {
        const kg = num(d?.emissionsKg);
        return kg === null ? { text: null } : { text: `${kg} kg CO₂e`, value: kg };
      }
      const text = back
        ? `Out: ${outText ?? '—'} · Back: ${backText ?? '—'}`
        : outText;
      return { text, value: num(out?.emissionsKg) ?? num(d?.emissionsKg) };
    },
  },
  {
    label: 'Legroom',
    cell: (d) => {
      const rooms = new Set<string>();
      for (const leg of [flightLeg(d, 'outbound'), flightLeg(d, 'return')]) {
        if (!leg) continue;
        for (const s of leg.segments) {
          const l = legroomLabel(str(asObj(s)?.legroom) ?? undefined);
          if (l) rooms.add(l);
        }
      }
      return { text: rooms.size ? [...rooms].join(' · ') : null };
    },
  },
];

// ----- lodging -----

const amenityList = (d: Obj | null): string[] =>
  arr(d?.amenities)
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .map((a) => a.trim());

const amenityText = (list: string[]): string | null =>
  list.length
    ? `${list.slice(0, 5).join(', ')}${list.length > 5 ? ` +${list.length - 5} more` : ''}`
    : null;

const ratingField = (label: string, key: string): CompareField => ({
  label,
  better: 'higher',
  cell: (d) => {
    const r = num(d?.[key]);
    return r === null ? { text: null } : { text: String(r), value: r };
  },
});

const LODGING_FIELDS: CompareField[] = [
  {
    label: 'Total price',
    better: 'lower',
    cell: (d, o) => {
      const total = num(d?.totalPrice) ?? o.price ?? null;
      return total === null
        ? { text: null }
        : { text: moneyText(total, str(d?.currency) ?? o.currency ?? 'USD'), value: total };
    },
  },
  {
    label: 'Per night',
    better: 'lower',
    cell: (d, o) => {
      const cur = str(d?.currency) ?? o.currency ?? 'USD';
      const direct = num(d?.pricePerNight);
      if (direct !== null) {
        return { text: `${moneyText(direct, cur)}/night`, value: direct };
      }
      // Derived, not fabricated: manual entries store only the total.
      const total = num(d?.totalPrice) ?? o.price ?? null;
      const ci = str(d?.checkIn);
      const co = str(d?.checkOut);
      const nights = ci && co ? nightsBetween(ci, co) : 0;
      if (total === null || nights <= 0) return { text: null };
      const per = Math.round((total / nights) * 100) / 100;
      return { text: `${moneyText(per, cur)}/night`, value: per };
    },
  },
  ratingField('Rating', 'rating'),
  {
    label: 'Reviews',
    better: 'higher',
    cell: (d) => {
      const r = num(d?.reviews);
      return r === null ? { text: null } : { text: countText(r, 'review'), value: r };
    },
  },
  {
    label: 'Hotel class',
    cell: (d) => {
      const n = num(d?.hotelClass);
      return n === null ? { text: null } : { text: `${n}-star` };
    },
  },
  ratingField('Location rating', 'locationRating'),
  {
    label: 'Check-in / out',
    cell: (d) => {
      const ci = str(d?.checkInTime);
      const co = str(d?.checkOutTime);
      if (!ci && !co) return { text: null };
      return { text: `${ci ?? '—'} / ${co ?? '—'}` };
    },
  },
  {
    label: 'Shared amenities',
    cell: (_d, _o, ctx) => {
      if (!ctx.anyAmenities) return { text: null };
      return { text: ctx.shared.size ? amenityText([...ctx.shared]) : 'None shared' };
    },
  },
  {
    label: 'Unique amenities',
    cell: (d, _o, ctx) => {
      if (!ctx.anyAmenities) return { text: null };
      return { text: amenityText(amenityList(d).filter((a) => !ctx.shared.has(a))) };
    },
  },
];

// ----- activity -----

const ACTIVITY_FIELDS: CompareField[] = [
  ratingField('Rating', 'rating'),
  {
    label: 'Reviews',
    better: 'higher',
    cell: (d) => {
      const r = num(d?.reviews);
      return r === null ? { text: null } : { text: countText(r, 'review'), value: r };
    },
  },
  {
    label: 'Price level',
    better: 'lower',
    cell: (d) => {
      const n = num(d?.priceLevel);
      if (n === null) return { text: null };
      return { text: n <= 0 ? 'Free' : '$'.repeat(Math.min(4, Math.round(n))), value: n };
    },
  },
  { label: 'Address', cell: (d) => ({ text: str(d?.address) }) },
  { label: 'Hours', cell: (d) => ({ text: weekSummary(d?.hours) }) },
];

// ----- transport / other / unknown kinds -----

const GENERIC_FIELDS: CompareField[] = [
  {
    label: 'Details',
    cell: (d, o) => ({ text: str(o.subtitle) ?? str(d?.description) ?? str(d?.summary) }),
  },
  {
    label: 'Price',
    better: 'lower',
    cell: (_d, o) => {
      const p = o.price ?? null;
      return p === null ? { text: null } : { text: moneyText(p, o.currency ?? 'USD'), value: p };
    },
  },
];

/** Row descriptors per option kind — exported for tests and the compare sheet. */
export function compareFields(kind: string): CompareField[] {
  switch (kind) {
    case 'flight':
      return FLIGHT_FIELDS;
    case 'lodging':
      return LODGING_FIELDS;
    case 'activity':
      return ACTIVITY_FIELDS;
    default:
      return GENERIC_FIELDS;
  }
}

/**
 * Per-kind attribute table: one row per field, one cell per option (same
 * order). `text` is '—' whenever the option didn't report the attribute.
 */
export function buildCompare(kind: string, options: CompareOption[]): CompareRow[] {
  const ctx: CompareCtx = { shared: new Set(), anyAmenities: false };
  if (kind === 'lodging') {
    const lists = options.map((o) => amenityList(asObj(o.data)));
    ctx.anyAmenities = lists.some((l) => l.length > 0);
    const [first = [], ...rest] = lists;
    ctx.shared = new Set(first.filter((a) => rest.every((l) => l.includes(a))));
  }
  return compareFields(kind).map((f) => {
    const raw = options.map((o) => f.cell(asObj(o.data), o, ctx));
    const best = f.better ? bestCell(raw.map((c) => c.value ?? null), f.better) : [];
    return {
      label: f.label,
      cells: raw.map((c, i) => ({ text: c.text ?? '—', best: best[i] || undefined })),
    };
  });
}

// ----- server-side projection -----

const pick = (o: Obj | null, keys: string[]): Obj | null =>
  o ? Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) : null;

/**
 * Slims trip_options.data to what buildCompare reads — keeps the optionPanel
 * payload small (lodging rows carry heavy image/description fields). Returns
 * null for non-objects so the sheet renders '—' for corrupt rows.
 */
export function compareDataFor(kind: string, data: unknown): unknown {
  const d = asObj(data);
  if (!d) return null;
  if (kind === 'flight') {
    const leg = (v: unknown): Obj | null => {
      const l = asObj(v);
      if (!l) return null;
      return {
        from: pick(asObj(l.from), ['code', 'name']),
        to: pick(asObj(l.to), ['code', 'name']),
        departLocal: l.departLocal,
        arriveLocal: l.arriveLocal,
        durationMin: l.durationMin,
        stops: l.stops,
        segments: arr(l.segments).map((s) =>
          pick(asObj(s), ['departLocal', 'airlineName', 'airlineCode', 'legroom'])),
        layovers: arr(l.layovers).map((s) =>
          pick(asObj(s), [
            'airportCode', 'airportName', 'cityName', 'departAirportCode', 'durationMin', 'overnight',
          ])),
        airlines: arr(l.airlines),
        emissionsKg: l.emissionsKg,
        typicalEmissionsKg: l.typicalEmissionsKg,
      };
    };
    return {
      outbound: leg(d.outbound),
      ...(d.return !== undefined ? { return: leg(d.return) } : {}),
      price: pick(asObj(d.price), ['total', 'perPerson', 'currency', 'isFrom']),
      emissionsKg: d.emissionsKg,
    };
  }
  if (kind === 'lodging') {
    return pick(d, [
      'pricePerNight', 'totalPrice', 'currency', 'rating', 'reviews', 'hotelClass',
      'locationRating', 'amenities', 'checkInTime', 'checkOutTime', 'checkIn', 'checkOut',
    ]);
  }
  if (kind === 'activity') {
    return pick(d, ['rating', 'reviews', 'priceLevel', 'address', 'hours', 'types', 'type']);
  }
  return data;
}

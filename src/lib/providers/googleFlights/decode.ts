// Ported from fli (MIT, commit 881aee5ff): search/_tfs.py extract_payload
// and search/_decoders.py positional layouts.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RawItinerary = {
  airlineCode: string | null;
  airlineNames: string[];
  segments: RawSegment[];
  from: string;
  to: string;
  departLocal: string;
  arriveLocal: string;
  durationMin: number | null;
  layovers: {
    airportCode: string;
    airportName?: string;
    cityName?: string;
    departAirportCode?: string;
    durationMin: number;
    overnight: boolean;
  }[];
  price: number | null;
  currency: string | null;
  bookingToken: string | null;
  emissionsKg?: number;
  typicalEmissionsKg?: number;
};

export type RawSegment = {
  airlineCode: string | null;
  airlineName: string | null;
  flightNumber: string;
  from: string;
  to: string;
  departLocal: string;
  arriveLocal: string;
  durationMin: number | null;
  aircraft?: string;
  legroom?: string;
  overnight: boolean;
};

const DS_BLOB = /AF_initDataCallback\((\{[\s\S]*?\})\);/g;
const DS_KEY = /key:\s*'([^']+)'/;
const DS_DATA = /data:([\s\S]*?),\s*sideChannel/;

/** Extract the ds:1 JSON payload from the rendered search page HTML. */
export function extractPayload(html: string): any | null {
  for (const m of html.matchAll(DS_BLOB)) {
    const blob = m[1];
    const key = DS_KEY.exec(blob);
    if (!key || key[1] !== 'ds:1') continue;
    const data = DS_DATA.exec(blob);
    if (!data) continue;
    try {
      return JSON.parse(data[1]);
    } catch {
      return null;
    }
  }
  return null;
}

function num(v: any): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}
function str(v: any): string | null {
  return typeof v === 'string' && v ? v : null;
}
const get = (a: any, i: number) => (Array.isArray(a) ? a[i] : undefined);

/** `[y,m,d]` + `[h,m]` arrays (zero parts omitted) → 'YYYY-MM-DDTHH:mm'. */
function toLocal(dateArr: any, timeArr: any): string {
  const p = (v: any) => (typeof v === 'number' ? v : 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = p(get(dateArr, 0));
  const mo = p(get(dateArr, 1));
  const d = p(get(dateArr, 2));
  const h = p(get(timeArr, 0));
  const mi = p(get(timeArr, 1));
  if (!y || !mo || !d) throw new Error('missing date parts');
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

function minutesOf(local: string): number {
  // minutes since epoch-free sortable origin: parse as UTC for ordering.
  return Date.parse(`${local}:00Z`);
}

/** Pull the ISO currency code out of a price token's raw bytes. */
function extractCurrency(token: any): string | null {
  if (typeof token !== 'string' || !token) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch {
    return null;
  }
  // Field 3 (length-delimited) carries the code in fli's token layout;
  // fall back to any embedded 3-letter uppercase run.
  const text = buf.toString('latin1');
  const tagMatch = /\x1a[\x03-\x06]([A-Za-z]{3})/.exec(text);
  if (tagMatch) return tagMatch[1].toUpperCase();
  const run = /[A-Z]{3}/.exec(text);
  return run ? run[0] : null;
}

function parseSegment(fl: any): RawSegment {
  const info = get(fl, 22) ?? [];
  return {
    airlineCode: str(get(info, 0)),
    airlineName: str(get(info, 3)),
    flightNumber: String(get(info, 1) ?? ''),
    from: get(fl, 3),
    to: get(fl, 6),
    departLocal: toLocal(get(fl, 20), get(fl, 8)),
    arriveLocal: toLocal(get(fl, 21), get(fl, 10)),
    durationMin: num(get(fl, 11)),
    aircraft: str(get(fl, 17)) ?? undefined,
    legroom: str(get(fl, 30)) ?? str(get(fl, 14)) ?? undefined,
    overnight: get(fl, 19) === true || get(fl, 19) === 1,
  };
}

function layoversOf(segments: RawSegment[], detailBlock: any) {
  const entries = Array.isArray(detailBlock) ? detailBlock : [];
  const out: RawItinerary['layovers'] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const prev = segments[i];
    const next = segments[i + 1];
    const entry = entries[i];
    out.push({
      airportCode: prev.to,
      airportName: Array.isArray(entry) ? (str(get(entry, 4)) ?? undefined) : undefined,
      cityName: Array.isArray(entry) ? (str(get(entry, 5)) ?? undefined) : undefined,
      departAirportCode: next.from !== prev.to ? next.from : undefined,
      durationMin: Math.max(
        0,
        Math.round((minutesOf(next.departLocal) - minutesOf(prev.arriveLocal)) / 60000),
      ),
      overnight: prev.arriveLocal.slice(0, 10) !== next.departLocal.slice(0, 10),
    });
  }
  return out;
}

function parsePrice(row: any): { price: number | null; currency: string | null } {
  const block = get(row, 1);
  if (!Array.isArray(block)) return { price: null, currency: null };
  const head = block[0];
  let price: number | null = null;
  if (Array.isArray(head) && head.length) {
    const raw = head[head.length - 1];
    if (typeof raw === 'number') price = raw;
  }
  return { price, currency: extractCurrency(block[1]) };
}

function emissionsKg(detail: any): number | undefined {
  const block = get(detail, 22);
  const g = num(get(block, 7));
  return g === null ? undefined : Math.round(g / 1000);
}

function typicalEmissionsKg(detail: any): number | undefined {
  const block = get(detail, 22);
  const g = num(get(block, 8));
  return g === null || g <= 0 ? undefined : Math.round(g / 1000);
}

/** Parse one itinerary row `it` from ds:1 rows (best or other list). */
export function parseItineraryRow(row: any): RawItinerary | null {
  const detail = get(row, 0);
  if (!Array.isArray(detail)) return null;
  const rawSegs = get(detail, 2) ?? [];
  if (!rawSegs.length) return null;
  const segments = rawSegs.map(parseSegment);
  const names = get(detail, 1);
  const { price, currency } = parsePrice(row);
  return {
    airlineCode: str(get(detail, 0)),
    airlineNames: Array.isArray(names) ? names.filter((n: any) => typeof n === 'string') : [],
    segments,
    from: get(detail, 3) ?? segments[0].from,
    to: get(detail, 6) ?? segments[segments.length - 1].to,
    departLocal: toLocal(get(detail, 4), get(detail, 5)),
    arriveLocal: toLocal(get(detail, 7), get(detail, 8)),
    durationMin: num(get(detail, 9)),
    layovers: layoversOf(segments, get(detail, 13)),
    price,
    currency,
    bookingToken: str(get(row, 8)),
    emissionsKg: emissionsKg(detail),
    typicalEmissionsKg: typicalEmissionsKg(detail),
  };
}

/** Decode a ds:1 payload into best/other itinerary lists. */
export function decodeDs1(data: any): { best: RawItinerary[]; other: RawItinerary[] } {
  const rowsOf = (i: number): any[] => {
    const outer = get(data, i);
    if (!Array.isArray(outer) || !Array.isArray(outer[0])) return [];
    return outer[0];
  };
  const parseAll = (rows: any[]) =>
    rows
      .map((r) => {
        try {
          return parseItineraryRow(r);
        } catch {
          return null;
        }
      })
      .filter((x): x is RawItinerary => x !== null);
  return { best: parseAll(rowsOf(2)), other: parseAll(rowsOf(3)) };
}

// Ported from fli (https://github.com/punitarani/fli, MIT License,
// commit 881aee5ff4321e81ea2157cb44be94ce6a21dc1b): search/_proto.py,
// search/_tfs.py. See THIRD_PARTY_NOTICES.md.

export type LegSpec = {
  origin: string;
  depDate: string; // YYYY-MM-DD
  dest: string;
  airline: string;
  flightNumber: string;
};

const MAX_U64 = (BigInt(1) << BigInt(64)) - BigInt(1);

function varint(value: number | bigint): Buffer {
  let v = BigInt(value);
  if (v < BigInt(0)) throw new Error('varint takes non-negative ints only');
  const out: number[] = [];
  for (;;) {
    const b = Number(v & BigInt(0x7f));
    v >>= BigInt(7);
    if (v) out.push(b | 0x80);
    else {
      out.push(b);
      return Buffer.from(out);
    }
  }
}

function tag(field: number, wire: number): Buffer {
  return varint((field << 3) | wire);
}

function lengthDelim(field: number, payload: Buffer | string): Buffer {
  const data = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  return Buffer.concat([tag(field, 2), varint(data.length), data]);
}

function varintField(field: number, value: number | bigint): Buffer {
  return Buffer.concat([tag(field, 0), varint(value)]);
}

const toUrlsafeB64 = (data: Buffer) =>
  data.toString('base64url').replace(/=+$/, '');

// Passenger kind codes (field 8): 1 adult, 2 child, 3 infant on lap,
// 4 infant in own seat — order and meanings per fli's _proto.py.
export function passengerCodes(pax: {
  adults?: number;
  children?: number;
  infantsOnLap?: number;
  infantsInSeat?: number;
}): number[] {
  const entries: [number, number | undefined][] = [
    [1, pax.adults],
    [2, pax.children],
    [3, pax.infantsOnLap],
    [4, pax.infantsInSeat],
  ];
  let total = 0;
  const codes: number[] = [];
  for (const [code, count] of entries) {
    const n = count ?? 0;
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`passenger count must be a non-negative int, got ${n}`);
    }
    total += n;
    for (let i = 0; i < n; i++) codes.push(code);
  }
  if (total > 9) {
    throw new Error(`${total} travellers exceeds Google's 9-traveller limit`);
  }
  return codes.length ? codes : [1];
}

// Cabin (field 9): 1 economy, 2 premium, 3 business, 4 first.
export const CABIN_SEAT: Record<string, number> = {
  economy: 1,
  premium_economy: 2,
  business: 3,
  first: 4,
};

// Stop ceiling (segment field 5): omitted for "any".
export const MAX_STOPS_FIELD: Record<string, number | undefined> = {
  any: undefined,
  nonstop: 0,
  one: 1,
  two: 2,
};

export function encodeTfsSegment(
  origins: string[],
  dests: string[],
  date: string,
  opts: {
    legs?: LegSpec[];
    maxStops?: number;
    carriers?: string[];
    carriersExclude?: string[];
  } = {},
): Buffer {
  let body = lengthDelim(2, date);
  if (opts.maxStops !== undefined) body = Buffer.concat([body, varintField(5, opts.maxStops)]);
  for (const c of opts.carriers ?? []) body = Buffer.concat([body, lengthDelim(6, c)]);
  for (const c of opts.carriersExclude ?? []) body = Buffer.concat([body, lengthDelim(7, c)]);
  for (const leg of opts.legs ?? []) {
    const inner = Buffer.concat([
      lengthDelim(1, leg.origin),
      lengthDelim(2, leg.depDate),
      lengthDelim(3, leg.dest),
      lengthDelim(5, leg.airline),
      lengthDelim(6, leg.flightNumber),
    ]);
    body = Buffer.concat([body, lengthDelim(4, inner)]);
  }
  for (const code of origins) {
    body = Buffer.concat([
      body,
      lengthDelim(13, Buffer.concat([varintField(1, 1), lengthDelim(2, code)])),
    ]);
  }
  for (const code of dests) {
    body = Buffer.concat([
      body,
      lengthDelim(14, Buffer.concat([varintField(1, 1), lengthDelim(2, code)])),
    ]);
  }
  return lengthDelim(3, body);
}

export function encodeTfsPayload(
  segments: Buffer,
  opts: {
    isOneWay: boolean;
    passengers?: number[];
    seat?: number;
    pinMaxU64?: boolean;
  },
): string {
  let payload = Buffer.concat([varintField(1, 28), varintField(2, 2), segments]);
  for (const kind of opts.passengers ?? [1]) {
    payload = Buffer.concat([payload, varintField(8, kind)]);
  }
  payload = Buffer.concat([
    payload,
    varintField(9, opts.seat ?? 1),
    varintField(14, 1),
  ]);
  if (opts.pinMaxU64) {
    payload = Buffer.concat([
      payload,
      lengthDelim(16, varintField(1, MAX_U64)),
    ]);
  }
  payload = Buffer.concat([payload, varintField(19, opts.isOneWay ? 2 : 1)]);
  return toUrlsafeB64(payload);
}

/** Deep-link tfs token for /travel/flights/booking (pin_max_u64 on). */
export function buildTfsToken(
  segments: LegSpec[][],
  opts: { isOneWay: boolean; passengers?: number[]; seat?: number },
): string {
  if (!segments.length) throw new Error('segments must be non-empty');
  segments.forEach((seg, i) => {
    if (!seg.length) throw new Error(`segment ${i} has no legs`);
  });
  const encoded = Buffer.concat(
    segments.map((seg) =>
      encodeTfsSegment(
        [seg[0].origin],
        [seg[seg.length - 1].dest],
        seg[0].depDate,
        { legs: seg },
      ),
    ),
  );
  return encodeTfsPayload(encoded, { ...opts, pinMaxU64: true });
}

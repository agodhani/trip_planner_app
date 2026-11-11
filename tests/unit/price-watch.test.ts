import { describe, expect, it } from 'vitest';
import {
  canPriceWatch,
  DROP_ALERT_PCT,
  groupByDatePair,
  isFromRoundTripSearch,
  legIdentityKey,
  optionDatePair,
  priceDelta,
  shouldAlertDrop,
  verdictFor,
} from '@/lib/domain/price-watch';

const seg = (over: Record<string, unknown> = {}) => ({
  airlineCode: 'TP', flightNumber: '202', from: { code: 'JFK' }, to: { code: 'LIS' },
  departLocal: '2026-12-04T20:15', arriveLocal: '2026-12-05T08:00', durationMin: 405,
  ...over,
});

const leg = (over: Record<string, unknown> = {}) => ({
  segments: [seg()],
  layovers: [],
  from: { code: 'JFK' }, to: { code: 'LIS' },
  departLocal: '2026-12-04T20:15', arriveLocal: '2026-12-05T08:00',
  fromTz: 'America/New_York', toTz: 'Europe/Lisbon',
  durationMin: 405, stops: 0, airlines: ['TP'],
  ...over,
});

const returnLeg = leg({
  from: { code: 'LIS' }, to: { code: 'JFK' },
  departLocal: '2026-12-07T10:00', arriveLocal: '2026-12-07T14:30',
  segments: [seg({ from: { code: 'LIS' }, to: { code: 'JFK' }, departLocal: '2026-12-07T10:00', arriveLocal: '2026-12-07T14:30' })],
});

const itinData = (over: Record<string, unknown> = {}) => ({
  id: 'abc123',
  outbound: leg(),
  price: { total: 412, perPerson: 412, currency: 'USD', isFrom: false },
  bookingUrl: 'https://example.com', isBest: false, fetchedAt: '',
  ...over,
});

const opt = (data: unknown, extra: Record<string, unknown> = {}) => ({
  id: 'opt-1', data, ...extra,
});

describe('canPriceWatch', () => {
  it('watches only google_flights flight options', () => {
    expect(canPriceWatch({ kind: 'flight', source: 'google_flights' })).toBe(true);
    expect(canPriceWatch({ kind: 'flight', source: 'manual' })).toBe(false);
    expect(canPriceWatch({ kind: 'flight', source: 'serpapi' })).toBe(false);
    expect(canPriceWatch({ kind: 'lodging', source: 'google_flights' })).toBe(false);
  });
});

describe('priceDelta', () => {
  it('computes cents and signed pct vs baseline', () => {
    expect(priceDelta(41200, 38800)).toEqual({ cents: -2400, pct: -2400 / 412 });
    expect(priceDelta(41200, 41200)).toEqual({ cents: 0, pct: 0 });
    expect(priceDelta(10000, 11000).pct).toBeCloseTo(10);
  });
  it('returns null pct for a zero baseline — never divides by zero', () => {
    expect(priceDelta(0, 500)).toEqual({ cents: 500, pct: null });
  });
});

describe('shouldAlertDrop', () => {
  it('fires at or beyond the 5% drop threshold', () => {
    expect(shouldAlertDrop(-5)).toBe(true);
    expect(shouldAlertDrop(-5.9)).toBe(true);
    expect(shouldAlertDrop(-4.9)).toBe(false);
    expect(shouldAlertDrop(0)).toBe(false);
    expect(shouldAlertDrop(8)).toBe(false);
    expect(shouldAlertDrop(null)).toBe(false);
    expect(shouldAlertDrop(undefined)).toBe(false);
    expect(DROP_ALERT_PCT).toBe(5);
  });
});

describe('optionDatePair', () => {
  it('reads depart/back from the stored legs', () => {
    expect(optionDatePair(itinData())).toEqual({ depart: '2026-12-04', back: null });
    expect(optionDatePair(itinData({ return: returnLeg }))).toEqual({ depart: '2026-12-04', back: '2026-12-07' });
  });
  it('returns null on malformed data', () => {
    expect(optionDatePair(null)).toBeNull();
    expect(optionDatePair({})).toBeNull();
    expect(optionDatePair({ outbound: { departLocal: 'not-a-date' } })).toBeNull();
    expect(optionDatePair({ outbound: {} })).toBeNull();
  });
});

describe('legIdentityKey', () => {
  it('joins segments exactly like the provider id hash input', () => {
    expect(legIdentityKey(leg())).toBe('TP202@2026-12-04T20:15');
    const two = leg({ segments: [seg(), seg({ flightNumber: '203', departLocal: '2026-12-05T06:00' })] });
    expect(legIdentityKey(two)).toBe('TP202@2026-12-04T20:15|TP203@2026-12-05T06:00');
  });
  it('returns null without segments', () => {
    expect(legIdentityKey(null)).toBeNull();
    expect(legIdentityKey({})).toBeNull();
    expect(legIdentityKey({ segments: [] })).toBeNull();
  });
});

describe('groupByDatePair', () => {
  it('groups options by their (depart, back) pair', () => {
    const a = opt(itinData({ id: 'a', return: returnLeg }));
    const b = opt(itinData({ id: 'b', return: returnLeg }));
    const c = opt(itinData({ id: 'c', outbound: leg({ departLocal: '2026-12-05T20:15' }) }));
    const { groups, skipped } = groupByDatePair([a, b, c]);
    expect(skipped).toEqual([]);
    expect(groups).toHaveLength(2);
    const rt = groups.find((g) => g.back === '2026-12-07')!;
    expect(rt.depart).toBe('2026-12-04');
    expect(rt.options).toHaveLength(2);
    const ow = groups.find((g) => g.back === null)!;
    expect(ow.depart).toBe('2026-12-05');
    expect(ow.options).toHaveLength(1);
  });

  it('skips unparseable options instead of guessing', () => {
    const { groups, skipped } = groupByDatePair([opt({ nonsense: true }), opt(itinData())]);
    expect(groups).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });

  it('flags outbound-only rows priced as "round trip from"', () => {
    expect(isFromRoundTripSearch(itinData({ price: { isFrom: true } }))).toBe(true);
    expect(isFromRoundTripSearch(itinData({ price: { isFrom: false } }))).toBe(false);
    expect(isFromRoundTripSearch(itinData({ return: returnLeg, price: { isFrom: true } }))).toBe(false);
  });

  it('resolves isFrom rows via resolveBack — and skips when unknown', () => {
    const fromRow = opt(itinData({ id: 'from-row', price: { isFrom: true } }));
    const oneWay = opt(itinData({ id: 'oneway', price: { isFrom: false } }));
    const resolve = (depart: string) => (depart === '2026-12-04' ? '2026-12-07' : null);
    const { groups, skipped } = groupByDatePair([fromRow, oneWay], resolve);
    // The isFrom row joined the Dec 4→7 pair; the true one-way stays alone.
    expect(skipped).toEqual([]);
    const rt = groups.find((g) => g.back === '2026-12-07')!;
    expect(rt.options.map((o) => (o.data as { id: string }).id)).toEqual(['from-row']);
    const ow = groups.find((g) => g.back === null)!;
    expect(ow.options).toHaveLength(1);
    // Without a resolver the isFrom row is skipped — never repriced one-way.
    const noResolve = groupByDatePair([fromRow, oneWay]);
    expect(noResolve.skipped).toEqual([fromRow]);
    expect(noResolve.groups).toHaveLength(1);
  });
});

describe('verdictFor', () => {
  const found = { id: 'x', price: { total: 388, currency: 'USD' } };
  it('is unavailable when the itinerary is absent from fresh results', () => {
    expect(verdictFor(undefined)).toEqual({ available: false, priceCents: null, currency: null });
  });
  it('converts a priced match to integer cents', () => {
    expect(verdictFor(found)).toEqual({ available: true, priceCents: 38800, currency: 'USD' });
  });
  it('keeps listed-but-unpriced as available with null price', () => {
    expect(verdictFor({ id: 'x', price: { total: null, currency: 'USD' } }))
      .toEqual({ available: true, priceCents: null, currency: 'USD' });
  });
  it('rounds fractional totals to cents', () => {
    expect(verdictFor({ id: 'x', price: { total: 388.499, currency: 'USD' } }).priceCents).toBe(38850);
  });
});

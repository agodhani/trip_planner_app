import { describe, expect, it } from 'vitest';
import { applyVerification, cheapestPairs, summarizePair, type PairResult } from '@/lib/services/flights';
import { buildTfsToken, encodeTfsPayload, encodeTfsSegment, passengerCodes } from '@/lib/providers/googleFlights/tfs';
import { extractPayload } from '@/lib/providers/googleFlights/decode';
import type { FlightItinerary } from '@/lib/providers/types';

const pair = { depart: '2026-12-04', back: '2026-12-07' };
const mkItin = (dep: string, total: number | null): FlightItinerary => ({
  id: 'x', price: { total, perPerson: total, currency: 'USD', isFrom: true }, bookingUrl: '', isBest: false,
  outbound: { segments: [], layovers: [], from: { code: 'JFK' }, to: { code: 'LIS' }, departLocal: dep, arriveLocal: dep, fromTz: 'America/New_York', toTz: 'Europe/Lisbon', durationMin: 400, stops: 0, airlines: [] },
  fetchedAt: '',
});

describe('scan helpers', () => {
  it('summarizePair filters by outbound window and picks minima', () => {
    const r = summarizePair(pair,
      [mkItin('2026-12-04T20:15', 700), mkItin('2026-12-04T06:00', 500), mkItin('2026-12-04T19:00', 900)],
      3, false, { outboundWindow: { start: '17:00', end: '23:59' }, windowTz: 'America/New_York', outboundTz: 'America/New_York' });
    expect(r.minTotal).toBe(700);
    expect(r.count).toBe(2);
    expect(r.rawCount).toBe(3);
  });
  it('cheapestPairs sorts by total', () => {
    const mk = (t: number | null): PairResult => ({ depart: '', back: null, status: 'done', minTotal: t, minPerPerson: t, currency: 'USD', count: 1, rawCount: 1, isFrom: false });
    expect(cheapestPairs([mk(9), mk(3), mk(null), mk(5)], 2).map((p) => p.minTotal)).toEqual([3, 5]);
  });
  it('applyVerification marks ok/no_match', () => {
    const r: PairResult = { depart: '', back: null, status: 'done', minTotal: 500, minPerPerson: 500, currency: 'USD', count: 1, rawCount: 1, isFrom: true };
    expect(applyVerification(r, [700, 650]).minTotal).toBe(650);
    expect(applyVerification(r, [700]).verified).toBe('ok');
    expect(applyVerification(r, []).verified).toBe('no_match');
    expect(applyVerification(r, []).minTotal).toBeNull();
  });
});

describe('tfs encoding', () => {
  it('passengerCodes maps adults/children/lap/seat', () => {
    expect(passengerCodes({ adults: 2, children: 1, infantsOnLap: 1, infantsInSeat: 1 })).toEqual([1, 1, 2, 3, 4]);
    expect(passengerCodes({})).toEqual([1]);
    expect(() => passengerCodes({ adults: 10 })).toThrow();
  });
  it('produces stable urlsafe base64 tokens', () => {
    const seg = encodeTfsSegment(['JFK', 'LGA'], ['LIS'], '2026-12-04', { maxStops: 1 });
    const t = encodeTfsPayload(seg, { isOneWay: false, passengers: [1], seat: 1 });
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    const again = encodeTfsPayload(encodeTfsSegment(['JFK', 'LGA'], ['LIS'], '2026-12-04', { maxStops: 1 }), { isOneWay: false, passengers: [1], seat: 1 });
    expect(t).toBe(again);
    const tok = buildTfsToken([[{ origin: 'JFK', depDate: '2026-12-04', dest: 'LIS', airline: 'DL', flightNumber: '272' }]], { isOneWay: true, passengers: [1], seat: 1 });
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('extractPayload', () => {
  it('pulls ds:1 JSON out of page HTML', () => {
    const html = `<script>AF_initDataCallback({key: 'ds:9', data: [1], sideChannel: {}});</script><script>AF_initDataCallback({key: 'ds:1', hash: 'x', data: [["a","b"],null,[["it1"]],[["it2"]]], sideChannel: {}});</script>`;
    const p = extractPayload(html);
    expect(p[2][0]).toEqual(['it1']);
  });
  it('returns null without a ds:1 blob', () => {
    expect(extractPayload('<html>AF_initDataCallback({key: "ds:2", data: [], sideChannel: {}});</html>')).toBeNull();
  });
});

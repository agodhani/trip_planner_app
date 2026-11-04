import { describe, expect, it } from 'vitest';
import {
  emissionsInfo, flightKey, fmtMin, hhmm, isWellFormedItin, isWellFormedLeg,
  layoverFlags, legroomLabel, plusOne, stopsLabel,
} from '@/lib/domain/flight-rows';

const leg = {
  from: { code: 'JFK' }, to: { code: 'LIS' },
  departLocal: '2026-12-04T20:15', arriveLocal: '2026-12-05T08:00',
  durationMin: 405, stops: 0,
  segments: [{ departLocal: '2026-12-04T20:15' }],
  layovers: [], airlines: ['Delta'],
};

describe('isWellFormedLeg/Itin', () => {
  it('accepts a normal leg and itinerary', () => {
    expect(isWellFormedLeg(leg)).toBe(true);
    expect(isWellFormedItin({ outbound: leg })).toBe(true);
    expect(isWellFormedItin({ outbound: leg, return: leg })).toBe(true);
  });
  it('rejects legs with empty or missing segments (render crash source)', () => {
    expect(isWellFormedLeg({ ...leg, segments: [] })).toBe(false);
    expect(isWellFormedLeg({ ...leg, segments: undefined })).toBe(false);
  });
  it('rejects malformed rows — missing codes, airlines, NaN duration, null', () => {
    expect(isWellFormedLeg({ ...leg, from: {} })).toBe(false);
    expect(isWellFormedLeg({ ...leg, airlines: undefined })).toBe(false);
    expect(isWellFormedLeg({ ...leg, durationMin: NaN })).toBe(false);
    expect(isWellFormedLeg(null)).toBe(false);
    expect(isWellFormedLeg('x')).toBe(false);
  });
  it('rejects an itinerary whose return leg is malformed', () => {
    expect(isWellFormedItin({ outbound: leg, return: { ...leg, segments: [] } })).toBe(false);
  });
});

describe('flightKey', () => {
  it('keys by itinerary id + outbound date + return date (blank when one-way/outbound-only)', () => {
    expect(flightKey({ id: 'abc', outbound: leg })).toBe('abc:2026-12-04:');
    expect(flightKey({ id: 'abc', outbound: leg, return: { departLocal: '2026-12-07T18:30' } }))
      .toBe('abc:2026-12-04:2026-12-07');
  });
});

describe('row format helpers', () => {
  it('formats duration, time slice, +1 marker, stops', () => {
    expect(fmtMin(405)).toBe('6h 45m');
    expect(fmtMin(60)).toBe('1h 0m');
    expect(hhmm('2026-12-04T20:15')).toBe('20:15');
    expect(plusOne('2026-12-05T08:00', leg.segments)).toBe(' +1');
    expect(plusOne('2026-12-04T23:00', leg.segments)).toBe('');
    expect(plusOne('2026-12-04T23:00', [])).toBe(''); // never throws on empty
  });
  it('labels stops and layover airports', () => {
    expect(stopsLabel(leg)).toBe('nonstop');
    expect(stopsLabel({
      ...leg, stops: 2,
      layovers: [{ airportCode: 'BOS', durationMin: 90 }, { airportCode: 'KEF', durationMin: 60 }],
    })).toBe('2 stops BOS, KEF');
  });
});

describe('emissionsInfo', () => {
  it('labels below / above / equal to typical', () => {
    expect(emissionsInfo({ emissionsKg: 443, typicalEmissionsKg: 480 }))
      .toEqual({ kg: 443, pct: -8, vsTypical: '8% below typical' });
    expect(emissionsInfo({ emissionsKg: 500, typicalEmissionsKg: 450 }))
      .toEqual({ kg: 500, pct: 11, vsTypical: '11% above typical' });
    expect(emissionsInfo({ emissionsKg: 480, typicalEmissionsKg: 480 }))
      .toEqual({ kg: 480, pct: 0, vsTypical: 'typical for this route' });
  });
  it('returns null when kg is missing, non-finite or non-positive', () => {
    expect(emissionsInfo({})).toBeNull();
    expect(emissionsInfo({ emissionsKg: 0, typicalEmissionsKg: 480 })).toBeNull();
    expect(emissionsInfo({ emissionsKg: -12 })).toBeNull();
    expect(emissionsInfo({ emissionsKg: NaN })).toBeNull();
  });
  it('has no pct or label without a usable typical', () => {
    expect(emissionsInfo({ emissionsKg: 443 }))
      .toEqual({ kg: 443, pct: null, vsTypical: null });
    expect(emissionsInfo({ emissionsKg: 443, typicalEmissionsKg: 0 }))
      .toEqual({ kg: 443, pct: null, vsTypical: null });
  });
});

describe('layoverFlags', () => {
  it('flags an airport change first', () => {
    expect(layoverFlags({ airportCode: 'LGA', departAirportCode: 'JFK', durationMin: 240 }))
      .toEqual([{ kind: 'airport_change', label: 'Change airports LGA → JFK' }]);
  });
  it('flags a real overnight layover instead of long', () => {
    expect(layoverFlags({ airportCode: 'YYZ', durationMin: 648, overnight: true }))
      .toEqual([{ kind: 'overnight', label: 'Overnight' }]);
  });
  it('a 40-min connection that crosses midnight is short, not overnight', () => {
    expect(layoverFlags({ airportCode: 'MAD', durationMin: 40, overnight: true }))
      .toEqual([{ kind: 'short', label: 'Short connection' }]);
  });
  it('flags a 6h+ daytime wait as a long layover', () => {
    expect(layoverFlags({ airportCode: 'MAD', durationMin: 400 }))
      .toEqual([{ kind: 'long', label: 'Long layover' }]);
  });
  it('a normal connection has no flags', () => {
    expect(layoverFlags({ airportCode: 'MAD', durationMin: 120 })).toEqual([]);
    expect(layoverFlags({ airportCode: 'MAD', durationMin: 150, overnight: true })).toEqual([]);
  });
});

describe('legroomLabel', () => {
  it('normalizes inches and in', () => {
    expect(legroomLabel('31 inches')).toBe('31 in legroom');
    expect(legroomLabel('31 in')).toBe('31 in legroom');
  });
  it('keeps other descriptions verbatim', () => {
    expect(legroomLabel('Below average')).toBe('Below average legroom');
  });
  it('is null when missing or blank', () => {
    expect(legroomLabel()).toBeNull();
    expect(legroomLabel('')).toBeNull();
    expect(legroomLabel('  ')).toBeNull();
  });
});

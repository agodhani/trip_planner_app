import { describe, expect, it } from 'vitest';
import {
  fmtMin, hhmm, isWellFormedItin, isWellFormedLeg, plusOne, stopsLabel,
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

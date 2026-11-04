/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeDs1, type RawItinerary } from '@/lib/providers/googleFlights/decode';

const load = (name: string) =>
  JSON.parse(readFileSync(`tests/fixtures/google_flights/${name}`, 'utf8'));

const OUTBOUNDS = 'outbounds/299e04e0ac836eec9d961da1fa372fb2bff7e15bbd2fdc78cb83becbd08d3428.json';
const RETURNS = 'returns/25938701ca2c3112afc3bd5725afff50fd8e3dc6bb310c6763b028f2507e4b0e.json';

const findByFlight = (its: RawItinerary[], fn: string) => {
  const it = its.find((i) => i.segments.some((s) => s.flightNumber === fn));
  if (!it) throw new Error(`flight ${fn} not in decoded fixtures`);
  return it;
};

describe('decodeDs1 on recorded Google Flights fixtures', () => {
  it('decodes leg emissions and the MAD layover for UX92+UX1155', () => {
    const { best, other } = decodeDs1(load(OUTBOUNDS));
    const it = findByFlight([...best, ...other], '92');
    expect(it.emissionsKg).toBe(443);
    expect(it.typicalEmissionsKg).toBe(480);
    expect(it.layovers).toHaveLength(1);
    expect(it.layovers[0].airportCode).toBe('MAD');
    expect(it.layovers[0].cityName).toBe('Madrid');
    expect(it.layovers[0].departAirportCode).toBeUndefined();
  });

  it('decodes the overnight YYZ layover for BA505+BA99+AA4542', () => {
    const { best, other } = decodeDs1(load(RETURNS));
    const it = findByFlight([...best, ...other], '505');
    const yyz = it.layovers.find((l) => l.airportCode === 'YYZ');
    expect(yyz).toBeDefined();
    expect(yyz!.durationMin).toBe(648);
    expect(yyz!.overnight).toBe(true);
    expect(yyz!.cityName).toBe('Toronto');
  });

  it('flags a departure airport change on the layover', () => {
    const data = load(OUTBOUNDS);
    const rows = [...(data[2]?.[0] ?? []), ...(data[3]?.[0] ?? [])];
    const row = rows.find((r: any) =>
      Array.isArray(r?.[0]?.[2]) && r[0][2].some((s: any) => s?.[22]?.[1] === '92'));
    expect(row).toBeDefined();
    const clone = JSON.parse(JSON.stringify(row));
    clone[0][2][1][3] = 'TOJ'; // second segment departs a different airport
    const { best } = decodeDs1([null, null, [[clone]], null]);
    expect(best).toHaveLength(1);
    expect(best[0].layovers[0].departAirportCode).toBe('TOJ');
  });
});

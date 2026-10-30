import { describe, expect, it } from 'vitest';
import {
  getAirport,
  searchPlaces,
} from '@/lib/providers/airports';

describe('airport place search', () => {
  it('"new york" gives a city group containing JFK, LGA, EWR', async () => {
    const results = await searchPlaces('new york');
    const group = results.find(
      (r) => r.type === 'city' && r.label === 'New York, US',
    );
    expect(group).toBeDefined();
    if (group?.type === 'city') {
      const iatas = group.airports.map((a) => a.iata);
      expect(iatas).toEqual(expect.arrayContaining(['JFK', 'LGA', 'EWR']));
      expect(group.primaryIata).toBe('JFK');
      expect(group.timezone).toBe('America/New_York');
      expect(results[0]).toBe(group);
    }
  });

  it('"LIS" is an exact IATA match first', async () => {
    const results = await searchPlaces('LIS');
    const first = results[0];
    expect(first.type).toBe('airport');
    if (first.type === 'airport') expect(first.airport.iata).toBe('LIS');
    const group = results.find(
      (r) => r.type === 'city' && r.label === 'Lisbon, PT',
    );
    expect(group).toBeDefined();
  });

  it('diacritic-insensitive: "sao paulo" finds GRU', async () => {
    const results = await searchPlaces('sao paulo');
    const group = results.find((r) => r.type === 'city');
    expect(group).toBeDefined();
    if (group?.type === 'city') {
      expect(group.airports.map((a) => a.iata)).toContain('GRU');
    }
  });

  it('empty query returns nothing; getAirport resolves by IATA', async () => {
    expect(await searchPlaces('')).toEqual([]);
    const jfk = await getAirport('jfk');
    expect(jfk?.iata).toBe('JFK');
    expect(jfk?.tz).toBe('America/New_York');
  });
});

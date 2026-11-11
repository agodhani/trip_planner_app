import { describe, expect, it } from 'vitest';
import {
  bestCell, buildCompare, compareDataFor, compareFields, type CompareOption,
} from '@/lib/domain/compare';

// ----- fixtures mimicking real trip_options.data payloads -----

type LegOver = Record<string, unknown>;
const flightSeg = (over: LegOver = {}) => ({
  airlineCode: 'DL', airlineName: 'Delta', flightNumber: '100',
  from: { code: 'JFK' }, to: { code: 'LIS' },
  departLocal: '2026-12-04T20:15', arriveLocal: '2026-12-05T08:00',
  durationMin: 705,
  ...over,
});
const flightLeg = (over: LegOver = {}) => ({
  segments: [flightSeg()],
  layovers: [] as unknown[],
  from: { code: 'JFK' }, to: { code: 'LIS' },
  departLocal: '2026-12-04T20:15', arriveLocal: '2026-12-05T08:00',
  fromTz: 'America/New_York', toTz: 'Europe/Lisbon',
  durationMin: 705, stops: 0, airlines: ['DL'],
  ...over,
});
const flightItin = (over: LegOver = {}) => ({
  id: 'x', outbound: flightLeg(),
  price: { total: 400, perPerson: 200, currency: 'USD', isFrom: false },
  bookingUrl: '', isBest: false, fetchedAt: '2026-10-30T00:00:00Z',
  ...over,
});
const opt = (o: Partial<CompareOption> & { id: string }): CompareOption => ({
  title: o.id, data: null, ...o,
});

const rowOf = (rows: { label: string }[], label: string) => {
  const r = rows.find((x) => x.label === label);
  if (!r) throw new Error(`missing row ${label}`);
  return r as { label: string; cells: { text: string; best?: boolean }[] };
};

describe('bestCell', () => {
  it('marks min for lower, max for higher', () => {
    expect(bestCell([300, 200, null], 'lower')).toEqual([false, true, false]);
    expect(bestCell([4.5, 4.8, 4.8], 'higher')).toEqual([false, true, true]);
  });
  it('marks all tied cells', () => {
    expect(bestCell([200, 200, 500], 'lower')).toEqual([true, true, false]);
  });
  it('marks nothing with fewer than two finite values', () => {
    expect(bestCell([5, null], 'higher')).toEqual([false, false]);
    expect(bestCell([null, null], 'lower')).toEqual([false, false]);
    expect(bestCell([1], 'lower')).toEqual([false]);
  });
  it('treats NaN and Infinity as missing', () => {
    expect(bestCell([NaN, 4, 9], 'higher')).toEqual([false, false, true]);
    expect(bestCell([Infinity, 4], 'higher')).toEqual([false, false]);
  });
});

describe('buildCompare flight', () => {
  const cheap = opt({
    id: 'a', title: 'Delta · JFK→LIS',
    data: flightItin({
      return: flightLeg({
        departLocal: '2026-12-07T18:30', arriveLocal: '2026-12-08T06:45',
        from: { code: 'LIS' }, to: { code: 'JFK' },
        durationMin: 735, stops: 1,
        layovers: [{ airportCode: 'MAD', durationMin: 150 }],
        emissionsKg: 460, typicalEmissionsKg: 480,
      }),
      outbound: flightLeg({
        emissionsKg: 443, typicalEmissionsKg: 480,
        segments: [flightSeg({ legroom: '31 in' })],
      }),
      price: { total: 400, perPerson: 200, currency: 'USD', isFrom: false },
    }),
  });
  const pricey = opt({
    id: 'b', title: 'TAP · JFK→LIS',
    data: flightItin({
      outbound: flightLeg({
        departLocal: '2026-12-04T07:00', arriveLocal: '2026-12-04T15:30',
        durationMin: 510,
        segments: [flightSeg({
          airlineCode: 'TP', airlineName: 'TAP', flightNumber: '200',
          departLocal: '2026-12-04T07:00', arriveLocal: '2026-12-04T15:30',
          durationMin: 510,
        })],
        airlines: ['TP'], emissionsKg: 500, typicalEmissionsKg: 480,
      }),
      return: flightLeg({
        departLocal: '2026-12-07T10:00', arriveLocal: '2026-12-07T20:00',
        from: { code: 'LIS' }, to: { code: 'JFK' },
        durationMin: 600, stops: 0, airlines: ['TP'],
        segments: [flightSeg({
          airlineCode: 'TP', airlineName: 'TAP', flightNumber: '201',
          from: { code: 'LIS' }, to: { code: 'JFK' },
          departLocal: '2026-12-07T10:00', arriveLocal: '2026-12-07T20:00',
          durationMin: 600,
        })],
      }),
      price: { total: 600, perPerson: 300, currency: 'USD', isFrom: false },
    }),
  });
  const rows = buildCompare('flight', [cheap, pricey]);

  it('builds the flight attribute rows', () => {
    expect(rows.map((r) => r.label)).toEqual([
      'Total price', 'Per person', 'Outbound', 'Return', 'Stops', 'Airlines', 'Emissions', 'Legroom',
    ]);
  });
  it('marks the cheapest total and per-person prices', () => {
    expect(rowOf(rows, 'Total price').cells).toEqual([
      { text: '$400', best: true }, { text: '$600' },
    ]);
    expect(rowOf(rows, 'Per person').cells[0]).toEqual({ text: '$200', best: true });
  });
  it('marks the fastest outbound and return', () => {
    const out = rowOf(rows, 'Outbound').cells;
    expect(out[0].text).toContain('JFK');
    expect(out[0].text).toContain('11h 45m');
    expect(out[1].text).toContain('8h 30m');
    expect(out[1].best).toBe(true);
    expect(out[0].best).toBeUndefined();
    expect(rowOf(rows, 'Return').cells[1].best).toBe(true);
  });
  it('summarises stops with layover time and flags fewest', () => {
    const cells = rowOf(rows, 'Stops').cells;
    expect(cells[0].text).toBe('Out: nonstop · Back: 1 stop · MAD 2h 30m');
    expect(cells[1].text).toBe('Out: nonstop · Back: nonstop');
    expect(cells[1].best).toBe(true);
  });
  it('shows airline names and per-leg emissions vs typical', () => {
    expect(rowOf(rows, 'Airlines').cells.map((c) => c.text)).toEqual(['Delta', 'TAP']);
    const em = rowOf(rows, 'Emissions').cells;
    expect(em[0].text).toBe('Out: 443 kg CO₂e · 8% below typical · Back: 460 kg CO₂e · 4% below typical');
    expect(em[0].best).toBe(true); // 443 < 500 on the shared outbound direction
    expect(em[1].text).toBe('Out: 500 kg CO₂e · 4% above typical · Back: —');
  });
  it('collects legroom labels and renders — when none', () => {
    const cells = rowOf(rows, 'Legroom').cells;
    expect(cells[0].text).toBe('31 in legroom');
    expect(cells[1].text).toBe('—');
  });
  it('renders — for a manual one-way missing the return leg', () => {
    const oneWay = opt({
      id: 'm', title: 'DL 272',
      data: flightItin({ price: { total: null, perPerson: null, currency: 'USD', isFrom: false } }),
    });
    const rs = buildCompare('flight', [oneWay, pricey]);
    const ret = rowOf(rs, 'Return').cells;
    expect(ret[0].text).toBe('—');
    expect(ret[1].text).toContain('10h 0m');
    // only one option reports a return → nothing is "best"
    expect(ret[0].best).toBeUndefined();
    expect(ret[1].best).toBeUndefined();
    expect(rowOf(rs, 'Per person').cells[0].text).toBe('—');
    expect(rowOf(rs, 'Total price').cells.map((c) => c.best ?? false)).toEqual([false, false]);
  });
  it('marks nothing when only one option reports a comparable value', () => {
    const noEm = opt({
      id: 'n',
      data: flightItin({ outbound: flightLeg({ emissionsKg: undefined, typicalEmissionsKg: undefined }) }),
    });
    const rs = buildCompare('flight', [cheap, noEm]);
    const em = rowOf(rs, 'Emissions').cells;
    expect(em[0].text).toContain('443 kg CO₂e');
    expect(em[1].text).toBe('—');
    expect(em.map((c) => c.best ?? false)).toEqual([false, false]);
  });
  it('never throws on malformed data — every cell degrades to —', () => {
    const rs = buildCompare('flight', [
      opt({ id: 'x', data: null }),
      opt({ id: 'y', data: 'junk' }),
      opt({ id: 'z', data: { outbound: { segments: [] } } }),
    ]);
    for (const r of rs) {
      expect(r.cells).toHaveLength(3);
      expect(r.cells.every((c) => c.text === '—')).toBe(true);
      expect(r.cells.every((c) => !c.best)).toBe(true);
    }
  });
  it('falls back to option.price when the payload has no price block', () => {
    const sparse = opt({
      id: 's', price: 350, currency: 'EUR',
      data: flightItin({ price: undefined }),
    });
    const rs = buildCompare('flight', [sparse, cheap]);
    const cells = rowOf(rs, 'Total price').cells;
    expect(cells[0].text).toBe('€350');
    expect(cells[0].best).toBe(true);
  });
});

describe('buildCompare lodging', () => {
  const a = opt({
    id: 'a', title: 'Hotel A',
    data: {
      name: 'Hotel A', totalPrice: 800, pricePerNight: 200, currency: 'USD',
      rating: 4.5, reviews: 1200, hotelClass: 4, locationRating: 4.8,
      checkInTime: '3:00 PM', checkOutTime: '11:00 AM',
      amenities: ['Pool', 'Wi-Fi', 'Gym', 'Spa', 'Bar', 'Breakfast'],
      checkIn: '2026-12-04', checkOut: '2026-12-08',
    },
  });
  const b = opt({
    id: 'b', title: 'Hotel B',
    data: {
      name: 'Hotel B', totalPrice: 600, currency: 'USD',
      rating: 4.9, reviews: 300, hotelClass: 3, locationRating: 4.2,
      checkInTime: '2:00 PM',
      amenities: ['Pool', 'Wi-Fi', 'Kitchen'],
      checkIn: '2026-12-04', checkOut: '2026-12-08',
    },
  });
  const rows = buildCompare('lodging', [a, b]);

  it('compares totals and derives per-night from total + dates', () => {
    expect(rowOf(rows, 'Total price').cells[0]).toEqual({ text: '$800' });
    expect(rowOf(rows, 'Total price').cells[1]).toEqual({ text: '$600', best: true });
    const perNight = rowOf(rows, 'Per night').cells;
    expect(perNight[0].text).toBe('$200/night');
    expect(perNight[1]).toEqual({ text: '$150/night', best: true }); // 600/4 nights
  });
  it('marks highest rating and most reviews', () => {
    expect(rowOf(rows, 'Rating').cells.map((c) => c.best ?? false)).toEqual([false, true]);
    expect(rowOf(rows, 'Reviews').cells[0]).toEqual({ text: '1,200 reviews', best: true });
    expect(rowOf(rows, 'Location rating').cells.map((c) => c.best ?? false)).toEqual([true, false]);
  });
  it('shows hotel class and check-in/out times', () => {
    expect(rowOf(rows, 'Hotel class').cells.map((c) => c.text)).toEqual(['4-star', '3-star']);
    expect(rowOf(rows, 'Check-in / out').cells.map((c) => c.text))
      .toEqual(['3:00 PM / 11:00 AM', '2:00 PM / —']);
  });
  it('splits amenities into shared and unique', () => {
    expect(rowOf(rows, 'Shared amenities').cells.map((c) => c.text))
      .toEqual(['Pool, Wi-Fi', 'Pool, Wi-Fi']);
    expect(rowOf(rows, 'Unique amenities').cells.map((c) => c.text))
      .toEqual(['Gym, Spa, Bar, Breakfast', 'Kitchen']);
  });
  it('renders — for manual stays with no amenity data', () => {
    const manual = opt({
      id: 'm', title: 'Rental', data: { name: 'Rental', totalPrice: 500, currency: 'USD', amenities: [] },
    });
    const rs = buildCompare('lodging', [manual, opt({ id: 'n', data: {} })]);
    expect(rowOf(rs, 'Shared amenities').cells.map((c) => c.text)).toEqual(['—', '—']);
    expect(rowOf(rs, 'Per night').cells[0].text).toBe('—'); // no checkIn/out to derive from
    expect(rowOf(rs, 'Rating').cells.every((c) => c.text === '—')).toBe(true);
  });
});

describe('buildCompare activity', () => {
  const hours = {
    monday: '9 AM–5 PM', tuesday: '9 AM–5 PM', wednesday: '9 AM–5 PM',
    thursday: '9 AM–5 PM', friday: '9 AM–5 PM', saturday: '9 AM–5 PM', sunday: 'Closed',
  };
  const a = opt({
    id: 'a', title: 'Museum',
    data: { rating: 4.6, reviews: 500, priceLevel: 2, address: 'Rua Augusta 1', hours },
  });
  const b = opt({
    id: 'b', title: 'Park',
    data: { rating: 4.2, reviews: 1500, priceLevel: 0 },
  });
  const rows = buildCompare('activity', [a, b]);

  it('compares rating, reviews and price level', () => {
    expect(rowOf(rows, 'Rating').cells[0]).toEqual({ text: '4.6', best: true });
    expect(rowOf(rows, 'Reviews').cells[1]).toEqual({ text: '1,500 reviews', best: true });
    const pl = rowOf(rows, 'Price level').cells;
    expect(pl[0].text).toBe('$$');
    expect(pl[1]).toEqual({ text: 'Free', best: true });
  });
  it('summarises opening hours and renders — for missing fields', () => {
    expect(rowOf(rows, 'Hours').cells[0].text).toBe('Mon–Sat 9 AM–5 PM · Sun Closed');
    expect(rowOf(rows, 'Hours').cells[1].text).toBe('—');
    expect(rowOf(rows, 'Address').cells.map((c) => c.text)).toEqual(['Rua Augusta 1', '—']);
  });
});

describe('buildCompare transport / other', () => {
  it('falls back to generic detail + price rows', () => {
    const rows = buildCompare('transport', [
      opt({ id: 't1', title: 'Train', subtitle: '3h · direct', price: 45, currency: 'EUR', data: {} }),
      opt({ id: 't2', title: 'Bus', subtitle: '5h · 1 change', price: 30, currency: 'EUR', data: {} }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Details', 'Price']);
    expect(rowOf(rows, 'Details').cells.map((c) => c.text)).toEqual(['3h · direct', '5h · 1 change']);
    expect(rowOf(rows, 'Price').cells[1]).toEqual({ text: '€30', best: true });
  });
  it('treats unknown kinds generically', () => {
    const rows = buildCompare('whatever', [opt({ id: 'u', title: 'Thing', data: {} })]);
    expect(rows.map((r) => r.label)).toEqual(['Details', 'Price']);
  });
});

describe('compareFields', () => {
  it('exposes per-kind row descriptors', () => {
    expect(compareFields('flight').map((f) => f.label)).toContain('Emissions');
    expect(compareFields('lodging').map((f) => f.label)).toContain('Shared amenities');
    expect(compareFields('other').map((f) => f.label)).toEqual(['Details', 'Price']);
  });
});

describe('compareDataFor', () => {
  it('projects only compare-relevant flight fields', () => {
    const slim = compareDataFor('flight', flightItin({
      outbound: flightLeg({ extraBlob: 'x'.repeat(100) }),
      bookingUrl: 'https://long-url', fetchedAt: 'now',
    })) as Record<string, unknown>;
    expect(slim).not.toHaveProperty('bookingUrl');
    expect(slim).not.toHaveProperty('fetchedAt');
    const out = slim.outbound as Record<string, unknown>;
    expect(out.from).toEqual({ code: 'JFK' });
    expect(out.durationMin).toBe(705);
    const seg = (out.segments as Record<string, unknown>[])[0];
    expect(Object.keys(seg).sort()).toEqual(['airlineCode', 'airlineName', 'departLocal']);
  });
  it('drops heavy lodging fields (images, nearbyPlaces, link)', () => {
    const slim = compareDataFor('lodging', {
      name: 'H', totalPrice: 800, currency: 'USD', rating: 4.5,
      images: ['https://a', 'https://b'], nearbyPlaces: ['x'], link: 'https://x',
      amenities: ['Pool'], checkIn: '2026-12-04', checkOut: '2026-12-08',
    }) as Record<string, unknown>;
    expect(slim).not.toHaveProperty('images');
    expect(slim).not.toHaveProperty('nearbyPlaces');
    expect(slim).not.toHaveProperty('link');
    expect(slim.totalPrice).toBe(800);
    expect(slim.amenities).toEqual(['Pool']);
  });
  it('keeps activity rating/hours, drops geo and website', () => {
    const slim = compareDataFor('activity', {
      rating: 4.6, reviews: 10, priceLevel: 2, address: 'Rua 1',
      hours: { monday: '9 AM–5 PM' }, lat: 38.7, lon: -9.1, website: 'https://x', thumbnail: 't',
    }) as Record<string, unknown>;
    expect(slim).not.toHaveProperty('lat');
    expect(slim).not.toHaveProperty('website');
    expect(slim.hours).toEqual({ monday: '9 AM–5 PM' });
  });
  it('passes transport/other data through and nulls non-objects', () => {
    expect(compareDataFor('transport', { note: 'rental car' })).toEqual({ note: 'rental car' });
    expect(compareDataFor('flight', null)).toBeNull();
    expect(compareDataFor('lodging', 'junk')).toBeNull();
    expect(compareDataFor('activity', [1, 2])).toBeNull();
  });
});

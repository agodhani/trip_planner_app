import { describe, expect, it } from 'vitest';
import { centroid, haversineKm } from '@/lib/domain/geo';
import { scoreLodgings } from '@/lib/domain/stay';
import { normalizeProperty } from '@/lib/providers/serpapi/hotels';
import { normalizeLocal } from '@/lib/providers/serpapi/maps';
import type { LodgingResult } from '@/lib/providers/types';

const mk = (over: Partial<LodgingResult>): LodgingResult => ({
  id: 'x', name: 'Hotel', kind: 'hotel', amenities: [], nearbyPlaces: [], images: [],
  ...over,
});

describe('geo', () => {
  it('haversineKm is sane', () => {
    // NYC → Lisbon ≈ 5,400 km; same point ≈ 0.
    expect(haversineKm(40.7, -74, 40.7, -74)).toBe(0);
  });
  it('centroid averages points', () => {
    expect(centroid([{ lat: 0, lon: 0 }, { lat: 2, lon: 4 }])).toEqual({ lat: 1, lon: 2 });
    expect(centroid([])).toBeNull();
  });
});

describe('scoreLodgings', () => {
  it('cheaper + better rated scores higher than pricier + worse', () => {
    const [cheap, mid, pricey] = scoreLodgings([
      mk({ id: 'a', pricePerNight: 60, rating: 4.6, reviews: 1200, locationRating: 4.2, currency: 'USD' }),
      mk({ id: 'b', pricePerNight: 120, rating: 4.0, reviews: 300, locationRating: 3.5, currency: 'USD' }),
      mk({ id: 'c', pricePerNight: 300, rating: 3.4, reviews: 20, locationRating: 2.8, currency: 'USD' }),
    ]);
    expect(cheap.score).toBeGreaterThan(mid.score);
    expect(mid.score).toBeGreaterThan(pricey.score);
    expect(cheap.reasons.join(' ')).toMatch(/below the .* median/);
  });
  it('no price gets penalized, never throws on empty fields', () => {
    const [s] = scoreLodgings([mk({ id: 'a' })]);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.reasons).toContain('No price shown');
  });
});

describe('normalizeProperty', () => {
  it('maps a SerpApi property row', () => {
    const r = normalizeProperty({
      name: 'Test Hotel', type: 'hotel', property_token: 'tok1',
      description: 'Nice hostel-style rooms',
      gps_coordinates: { latitude: 38.7, longitude: -9.1 },
      rate_per_night: { extracted_lowest: 85 },
      total_rate: { extracted_lowest: 170 },
      overall_rating: 4.4, reviews: 900, extracted_hotel_class: 3,
      location_rating: 4.1, amenities: ['Free Wi-Fi'],
      check_in_time: '3:00 PM', check_out_time: '12:00 PM',
      images: [{ thumbnail: 't.jpg' }], link: 'https://x',
    }, 'USD', 'hotel');
    expect(r.id).toBe('tok1');
    expect(r.pricePerNight).toBe(85);
    expect(r.totalPrice).toBe(170);
    expect(r.isHostel).toBe(true); // "hostel" appears in the description
    expect(r.images).toEqual(['t.jpg']);
  });
});

describe('normalizeLocal', () => {
  it('maps a SerpApi local_result row', () => {
    const r = normalizeLocal({
      title: 'Cool Museum', place_id: 'ChIJx', data_id: '0x1',
      gps_coordinates: { latitude: 1, longitude: 2 },
      rating: 4.7, reviews: 500, extracted_price: 2,
      type: 'Museum', types: ['Museum', 'Tourist attraction'],
      address: '1 St', operating_hours: { monday: '9 AM–5 PM' },
      website: 'https://m', phone: '+1', thumbnail: 't.jpg',
    });
    expect(r.id).toBe('ChIJx');
    expect(r.types).toHaveLength(2);
    expect(r.priceLevel).toBe(2);
    expect(r.lat).toBe(1);
  });
});

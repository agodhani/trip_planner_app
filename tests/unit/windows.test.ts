import { describe, expect, it } from 'vitest';
import { passesWindow, windowForDate } from '@/lib/domain/dates/windows';

const W = { start: '17:00', end: '23:59' };
const NY = 'America/New_York';
const LIS = 'Europe/Lisbon';
const LAX = 'America/Los_Angeles';

describe('windowForDate', () => {
  it('NY 17:00–23:59 → LIS is 22:00–23:59 clipped (Nov, EST→UTC+0)', () => {
    expect(windowForDate(W, NY, LIS, '2026-11-16')).toEqual({
      startMinute: 22 * 60, endMinute: 23 * 60 + 59, clipped: true,
    });
  });
  it('NY 17:00–23:59 → LAX is 14:00–20:59 not clipped', () => {
    expect(windowForDate(W, NY, LAX, '2026-11-16')).toEqual({
      startMinute: 14 * 60, endMinute: 20 * 60 + 59, clipped: false,
    });
  });
  it('handles US DST end (Nov 1, 2026: EDT→EST)', () => {
    // Window fully inside the day, still convertible.
    const w = windowForDate({ start: '09:00', end: '12:00' }, NY, NY, '2026-11-01');
    expect(w).toEqual({ startMinute: 540, endMinute: 720, clipped: false });
  });
  it('handles EU DST end (Oct 25, 2026: LIS UTC+1→UTC+0)', () => {
    const w = windowForDate(W, NY, LIS, '2026-10-25');
    // 17:00 EDT = 21:00 Lisbon (UTC+1 before the 25th switch at 01:00 UTC).
    expect(w?.startMinute).toBe(21 * 60);
    expect(w?.endMinute).toBe(23 * 60 + 59);
  });
  it('returns null when the window misses the airport day entirely', () => {
    // NY morning window lands on the previous day far ahead in Sydney.
    expect(
      windowForDate({ start: '00:00', end: '06:00' }, 'Australia/Sydney', NY, '2026-11-16'),
    ).toBeNull();
  });
});

describe('passesWindow', () => {
  it('filters exact instants in airport-local time', () => {
    const d = '2026-11-16';
    expect(passesWindow('2026-11-16T22:30', LIS, W, NY, d)).toBe(true);
    expect(passesWindow('2026-11-16T21:59', LIS, W, NY, d)).toBe(false);
    expect(passesWindow('2026-11-16T23:59', LIS, W, NY, d)).toBe(true);
    expect(passesWindow('2026-11-17T00:15', LIS, W, NY, d)).toBe(false);
    expect(passesWindow('2026-11-16T06:00', LIS, undefined, NY, d)).toBe(true);
  });
});

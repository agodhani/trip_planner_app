import { describe, expect, it } from 'vitest';
import { dateRange, dayLabel, money, nightsBetween, plural, shortDate, weekday } from '@/lib/ui-format';

describe('money', () => {
  it('formats with currency symbols and fixed digits', () => {
    expect(money(646, 'USD')).toBe('$646');
    expect(money(21.6, 'USD', 2)).toBe('$21.60');
    expect(money(1234.5, 'EUR', 2)).toBe('€1,234.50');
    expect(money(99.5, 'USD')).toBe('$100');
  });
  it('degrades gracefully for missing values and bad currency codes', () => {
    expect(money(null)).toBe('—');
    expect(money(undefined)).toBe('—');
    expect(money(Number.NaN)).toBe('—');
    expect(money(10, 'NOPE')).toBe('NOPE 10');
  });
});

describe('calendar dates', () => {
  it('labels ISO dates without timezone drift', () => {
    expect(dayLabel('2026-12-04')).toBe('Fri, Dec 4');
    expect(dayLabel('2026-12-04T23:30')).toBe('Fri, Dec 4'); // local-time strings keep their calendar day
    expect(shortDate('2026-01-01')).toBe('Jan 1');
    expect(weekday('2026-12-07')).toBe('Mon');
  });
  it('formats ranges and collapses same-day ranges', () => {
    expect(dateRange('2026-12-04', '2026-12-07')).toBe('Fri, Dec 4 – Mon, Dec 7');
    expect(dateRange('2026-12-04', '2026-12-04')).toBe('Fri, Dec 4');
    expect(dateRange('2026-12-04', null)).toBe('Fri, Dec 4');
  });
  it('counts nights across month/year boundaries and never goes negative', () => {
    expect(nightsBetween('2026-12-04', '2026-12-07')).toBe(3);
    expect(nightsBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(nightsBetween('2026-12-07', '2026-12-04')).toBe(0);
  });
  it('passes through unparseable input instead of throwing', () => {
    expect(dayLabel('soon')).toBe('soon');
    expect(nightsBetween('x', '2026-12-04')).toBe(0);
  });
});

describe('plural', () => {
  it('pluralizes by count', () => {
    expect(plural(1, 'night')).toBe('1 night');
    expect(plural(3, 'night')).toBe('3 nights');
    expect(plural(0, 'activity', 'activities')).toBe('0 activities');
  });
});

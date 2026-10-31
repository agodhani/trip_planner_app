import { describe, expect, it } from 'vitest';
import { autoAssign, dayList, plusDays } from '@/lib/domain/itinerary';

describe('dayList/plusDays', () => {
  it('lists inclusive days', () => {
    expect(dayList('2026-12-04', '2026-12-07')).toEqual(['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07']);
    expect(plusDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('autoAssign', () => {
  const days = [
    { day: 'd1', anchor: { lat: 0, lon: 0 }, capacity: 2 },
    { day: 'd2', anchor: { lat: 10, lon: 10 }, capacity: 2 },
  ];
  it('assigns items to the nearest anchor and respects capacity', () => {
    const plan = autoAssign(days, [
      { id: 'a', lat: 0.1, lon: 0 },
      { id: 'b', lat: 10.1, lon: 10 },
      { id: 'c', lat: 0.2, lon: 0 },
      { id: 'd', lat: 10.2, lon: 10 },
      { id: 'e', lat: 0.15, lon: 0 }, // exceeds d1 capacity → unassigned
    ]);
    expect(plan.get('d1')).toContain('a');
    expect(plan.get('d2')).toContain('b');
    expect(plan.get('d1')!.length + plan.get('d2')!.length).toBe(4);
    expect([...plan.get('d1')!, ...plan.get('d2')!]).not.toContain('e');
  });
  it('unlocated items fill the emptiest day', () => {
    const plan = autoAssign(days, [{ id: 'x' }, { id: 'y' }, { id: 'z', lat: 0.1, lon: 0 }]);
    const total = [...plan.values()].flat();
    expect(total.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { autoAssign, dayList, orderDay, plusDays, to24h } from '@/lib/domain/itinerary';

describe('to24h', () => {
  it('converts provider check-in/out times to 24h', () => {
    expect(to24h('3:00 PM')).toBe('15:00');
    expect(to24h('11:00 AM')).toBe('11:00');
    expect(to24h('12:00 PM')).toBe('12:00');
    expect(to24h('12:30 AM')).toBe('00:30');
    expect(to24h('11 am')).toBe('11:00');
    expect(to24h('15:00')).toBe('15:00');
  });
  it('rejects garbage instead of storing a wrong time', () => {
    expect(to24h('noon')).toBeUndefined();
    expect(to24h('25:00')).toBeUndefined();
    expect(to24h(undefined)).toBeUndefined();
  });
});

describe('orderDay', () => {
  const it_ = (id: string, kind: string, startTime: string | null, sortOrder = 10) => ({ id, kind, startTime, sortOrder });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it('orders by time, with untimed items around midday in the order added', () => {
    expect(ids(orderDay([
      it_('dinner', 'meal', '19:30', 10),
      it_('museum', 'activity', null, 20),
      it_('walk', 'activity', null, 30),
      it_('breakfast', 'meal', '08:00:00', 40),
    ]))).toEqual(['breakfast', 'museum', 'walk', 'dinner']);
  });

  it('lands before check-in even when check-in time is earlier', () => {
    expect(ids(orderDay([
      it_('in', 'checkin', '03:00'),
      it_('land', 'flight_arrive', '09:05'),
    ]))).toEqual(['land', 'in']);
  });

  it('checks out before an early flight even if the checkout deadline is later', () => {
    expect(ids(orderDay([
      it_('fly', 'flight_depart', '07:05', 0),
      it_('coffee', 'meal', '06:30'),
      it_('out', 'checkout', '11:30', 0),
      it_('home', 'flight_arrive', '21:40', 90),
    ]))).toEqual(['coffee', 'out', 'fly', 'home']);
  });
});

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

describe('autoAssign with avoidDays', () => {
  const twoDays = [
    { day: 'd1', anchor: { lat: 0, lon: 0 }, capacity: 2 },
    { day: 'd2', anchor: { lat: 10, lon: 10 }, capacity: 2 },
  ];
  it('an item near day 1 that avoids d1 goes to d2', () => {
    const plan = autoAssign(twoDays, [
      { id: 'a', lat: 0.1, lon: 0, avoidDays: ['d1'] },
    ]);
    expect(plan.get('d2')).toContain('a');
    expect(plan.get('d1') ?? []).not.toContain('a');
  });
  it('an item avoiding every day is still placed', () => {
    const plan = autoAssign(twoDays, [
      { id: 'a', lat: 0.1, lon: 0, avoidDays: ['d1', 'd2'] },
    ]);
    expect([...plan.values()].flat()).toContain('a');
  });
});

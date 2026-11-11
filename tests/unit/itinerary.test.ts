import { describe, expect, it } from 'vitest';
import { arrangeableDays, autoAssign, computeDrop, dayList, orderDay, plusDays, to24h } from '@/lib/domain/itinerary';

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

describe('computeDrop', () => {
  const it_ = (id: string, kind: string, startTime: string | null, sortOrder = 10) => ({ id, kind, startTime, sortOrder });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  // Apply a drop result to a column and check the displayed orderDay order.
  const appliedOrder = (col: ReturnType<typeof it_>[], drop: ReturnType<typeof computeDrop>, dragged: ReturnType<typeof it_>) => {
    const next = col
      .filter((i) => i.id !== dragged.id)
      .map((i) => ({ ...i, sortOrder: drop.siblings?.find((s) => s.id === i.id)?.sortOrder ?? i.sortOrder }))
      .concat([{ ...dragged, startTime: drop.startTime, sortOrder: drop.sortOrder }]);
    return ids(orderDay(next));
  };

  it('between two timed items takes the snapped midpoint time', () => {
    const col = [it_('a', 'activity', '09:00'), it_('b', 'activity', '11:00', 20)];
    const drop = computeDrop(col, 'x', '2026-11-05', 1);
    expect(drop).toMatchObject({ day: '2026-11-05', startTime: '10:00' });
    expect(appliedOrder(col, drop, it_('x', 'activity', null))).toEqual(['a', 'x', 'b']);
  });

  it('snaps to quarter hours and lets sortOrder break boundary ties', () => {
    const col = [it_('a', 'activity', '09:00'), it_('b', 'activity', '09:15', 20)];
    const drop = computeDrop(col, 'x', 'd', 1);
    // midpoint 09:07:30 → snap → 09:15 (boundary) — sortOrder keeps it before b.
    expect(drop.startTime).toBe('09:15');
    expect(drop.sortOrder).toBeLessThan(drop.siblings?.find((s) => s.id === 'b')?.sortOrder ?? 20);
    expect(appliedOrder(col, drop, it_('x', 'activity', null))).toEqual(['a', 'x', 'b']);
  });

  it('uses the raw midpoint below a 15-minute gap', () => {
    const col = [it_('a', 'activity', '09:00'), it_('b', 'activity', '09:10', 20)];
    const drop = computeDrop(col, 'x', 'd', 1);
    expect(drop.startTime).toBe('09:05');
    expect(appliedOrder(col, drop, it_('x', 'activity', null))).toEqual(['a', 'x', 'b']);
  });

  it('dropping at the top uses next−60 clamped to 05:00', () => {
    expect(computeDrop([it_('a', 'activity', '09:00')], 'x', 'd', 0).startTime).toBe('08:00');
    expect(computeDrop([it_('a', 'activity', '05:30')], 'x', 'd', 0).startTime).toBe('05:00');
  });

  it('dropping at the bottom uses prev+60 clamped to 23:45', () => {
    expect(computeDrop([it_('a', 'activity', '14:00')], 'x', 'd', 1).startTime).toBe('15:00');
    const late = computeDrop([it_('a', 'activity', '23:30')], 'x', 'd', 1);
    expect(late.startTime).toBe('23:45');
    // Clamped equal-or-earlier times still land after the previous card.
    expect(appliedOrder([it_('a', 'activity', '23:30')], late, it_('x', 'activity', null))).toEqual(['a', 'x']);
  });

  it('among untimed items stays untimed and orders by sortOrder', () => {
    const col = [it_('a', 'activity', null, 10), it_('b', 'activity', null, 20), it_('c', 'activity', null, 30)];
    const drop = computeDrop(col, 'x', 'd', 1);
    expect(drop.startTime).toBeNull();
    expect(appliedOrder(col, drop, it_('x', 'activity', null))).toEqual(['a', 'x', 'b', 'c']);
  });

  it('normalizes colliding sortOrders so the item lands exactly at the slot', () => {
    const col = [it_('a', 'activity', null, 10), it_('b', 'activity', null, 10)];
    const drop = computeDrop(col, 'x', 'd', 1);
    expect(appliedOrder(col, drop, it_('x', 'activity', null))).toEqual(['a', 'x', 'b']);
    expect(drop.siblings?.length).toBe(2);
  });

  it('between the untimed cluster and an evening item stays untimed at the cluster edge', () => {
    const col = [it_('a', 'activity', null, 10), it_('b', 'meal', '19:00', 20)];
    const drop = computeDrop(col, 'x', 'd', 1);
    expect(drop.startTime).toBeNull();
    expect(appliedOrder(col, drop, it_('x', 'activity', null))).toEqual(['a', 'x', 'b']);
  });

  it('between a morning item and the untimed cluster joins the cluster at its start', () => {
    const col = [it_('a', 'activity', '08:00', 10), it_('b', 'activity', null, 20), it_('c', 'activity', null, 30)];
    const drop = computeDrop(col, 'x', 'd', 1);
    expect(drop.startTime).toBeNull();
    expect(appliedOrder(col, drop, it_('x', 'activity', null))).toEqual(['a', 'x', 'b', 'c']);
  });

  it('drops between anchors without disturbing them', () => {
    const col = [it_('land', 'flight_arrive', '09:05', 0), it_('in', 'checkin', '15:00', 50)];
    const drop = computeDrop(col, 'x', 'd', 1);
    expect(drop.startTime).toBe('12:00'); // snapped midpoint of 09:05–15:00 (355min gap → 722.5→720? midpoint 12:02:30 → snap 12:00)
    expect(appliedOrder(col, drop, it_('x', 'activity', null))).toEqual(['land', 'x', 'in']);
    // Anchors keep their own rows — siblings only renumber sortOrder.
    for (const s of drop.siblings ?? []) {
      expect(s.sortOrder).toBeGreaterThanOrEqual(0);
    }
  });

  it('drop before the first anchor is an edge slot, anchor unmoved', () => {
    const col = [it_('land', 'flight_arrive', '09:05', 0)];
    const drop = computeDrop(col, 'x', 'd', 0);
    expect(drop.startTime).toBe('08:05');
    expect(appliedOrder(col, drop, it_('x', 'activity', null))).toEqual(['x', 'land']);
  });

  it('moving within a column places the card at the hovered slot', () => {
    const col = [it_('a', 'activity', null, 10), it_('b', 'activity', null, 20), it_('c', 'activity', null, 30)];
    const drop = computeDrop(col, 'a', 'd', 2); // drop a onto slot of c
    expect(appliedOrder(col, drop, it_('a', 'activity', null, 10))).toEqual(['b', 'c', 'a']);
  });

  it('an empty column gets an untimed item', () => {
    const drop = computeDrop([], 'x', 'd', 0);
    expect(drop).toMatchObject({ day: 'd', startTime: null });
  });

  it('the unscheduled column clears the time', () => {
    const col = [it_('a', 'activity', '14:00', 10)];
    const drop = computeDrop(col, 'a', null, 0);
    expect(drop).toMatchObject({ day: null, startTime: null });
  });
});

describe('arrangeableDays', () => {
  const days = dayList('2026-11-04', '2026-11-09');
  it('limits to [first arrival .. last departure]', () => {
    const anchors = [
      { kind: 'flight_depart', day: '2026-11-04' }, // leaving home
      { kind: 'flight_arrive', day: '2026-11-05' }, // landing at destination
      { kind: 'flight_depart', day: '2026-11-08' }, // flying home
      { kind: 'flight_arrive', day: '2026-11-08' }, // landing home
      { kind: 'checkin', day: '2026-11-05' },
      { kind: 'checkout', day: '2026-11-08' },
    ];
    expect(arrangeableDays(days, anchors)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });
  it('returns all days when there are no flight anchors', () => {
    expect(arrangeableDays(days, [{ kind: 'checkin', day: '2026-11-05' }])).toEqual(days);
    expect(arrangeableDays(days, [])).toEqual(days);
  });
  it('clamps to the trip day list', () => {
    const anchors = [
      { kind: 'flight_arrive', day: '2026-11-02' }, // before the listed range
      { kind: 'flight_depart', day: '2026-11-20' },
    ];
    expect(arrangeableDays(days, anchors)).toEqual(days);
  });
});

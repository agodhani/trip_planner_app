import { describe, expect, it } from 'vitest';
import {
  fmtMin, planToday, safeZone, tripLive, tripPhase,
  type TodayItem, type TodayLeg,
} from '@/lib/domain/today';

const item = (id: string, over: Partial<TodayItem> = {}): TodayItem => ({
  id,
  title: `Item ${id}`,
  kind: 'activity',
  startTime: null,
  endTime: null,
  durationMin: null,
  sortOrder: 0,
  outcome: 'planned',
  ...over,
});

const NO_LEGS: TodayLeg[] = [];

describe('planToday classification', () => {
  const items = [
    item('past', { startTime: '08:00', endTime: '09:00' }),
    item('current', { startTime: '11:00', endTime: '13:00' }),
    item('next-one', { startTime: '15:30' }),
    item('later-one', { startTime: '18:00', endTime: '19:00' }),
    item('untimed'),
    item('finished', { startTime: '20:00', outcome: 'done' }),
  ];
  const plan = planToday(items, NO_LEGS, 12 * 60); // 12:00 local

  it('classifies each slot', () => {
    expect(plan.now.map((e) => e.item.id)).toEqual(['current']);
    expect(plan.next?.item.id).toBe('next-one');
    expect(plan.later.map((e) => e.item.id)).toEqual(['later-one']);
    expect(plan.earlier.map((e) => e.item.id)).toEqual(['past']);
    expect(plan.anytime.map((e) => e.item.id)).toEqual(['untimed']);
    expect(plan.doneToday.map((e) => e.item.id)).toEqual(['finished']);
  });

  it('counts progress over all items', () => {
    expect(plan.progress).toEqual({ done: 1, total: 6 });
  });

  it('untimed items never block now', () => {
    const p = planToday([item('loose')], NO_LEGS, 12 * 60);
    expect(p.now).toHaveLength(0);
    expect(p.anytime.map((e) => e.item.id)).toEqual(['loose']);
  });

  it('outcome-bearing items leave the schedule even when timed in the future', () => {
    const p = planToday(
      [item('a', { startTime: '20:00', outcome: 'skipped' }), item('b', { startTime: '21:00' })],
      NO_LEGS,
      12 * 60,
    );
    expect(p.next?.item.id).toBe('b');
    expect(p.doneToday.map((e) => e.item.id)).toEqual(['a']);
  });
});

describe('planToday boundaries', () => {
  const at = (start: string, end: string | null, nowMin: number) =>
    planToday([item('x', { startTime: start, endTime: end })], NO_LEGS, nowMin);

  it('is "now" at the exact start and end minutes, past one minute after', () => {
    expect(at('11:00', '13:00', 11 * 60).now).toHaveLength(1);
    expect(at('11:00', '13:00', 13 * 60).now).toHaveLength(1);
    expect(at('11:00', '13:00', 13 * 60 + 1).earlier).toHaveLength(1);
    expect(at('11:00', '13:00', 10 * 60 + 59).next?.item.id).toBe('x');
  });

  it('treats a start-only item as a point event: now only at its minute', () => {
    expect(at('17:00', null, 17 * 60).now).toHaveLength(1);
    expect(at('17:00', null, 17 * 60 + 1).earlier).toHaveLength(1);
    expect(at('17:00', null, 16 * 60).next?.item.id).toBe('x');
  });

  it('uses durationMin when there is no endTime', () => {
    const p = planToday([item('x', { startTime: '10:00', durationMin: 90 })], NO_LEGS, 11 * 60);
    expect(p.now).toHaveLength(1);
    expect(planToday([item('x', { startTime: '10:00', durationMin: 90 })], NO_LEGS, 11 * 60 + 31).earlier).toHaveLength(1);
  });

  it('reads an endTime at/before start as after midnight', () => {
    const late = item('late', { startTime: '22:00', endTime: '02:00' });
    const e = planToday([late], NO_LEGS, 23 * 60);
    expect(e.now).toHaveLength(1);
    expect(e.now[0].endMin).toBe(26 * 60); // 02:00 next day
    expect(planToday([late], NO_LEGS, 21 * 60).next?.item.id).toBe('late');
  });

  it('keeps overlapping now items in day order', () => {
    const p = planToday(
      [
        item('b', { startTime: '09:30', endTime: '10:30', sortOrder: 20 }),
        item('a', { startTime: '09:00', endTime: '10:00', sortOrder: 10 }),
      ],
      NO_LEGS,
      9 * 60 + 45,
    );
    expect(p.now.map((e) => e.item.id)).toEqual(['a', 'b']);
  });

  it('handles day edges: 00:00 and 23:59', () => {
    const early = item('early', { startTime: '00:00', endTime: '00:30' });
    expect(planToday([early], NO_LEGS, 0).now).toHaveLength(1);
    const late = item('late', { startTime: '23:50' });
    expect(planToday([late], NO_LEGS, 23 * 60).next?.item.id).toBe('late');
    expect(planToday([late], NO_LEGS, 23 * 60 + 59).earlier).toHaveLength(1);
  });
});

describe('planToday free gaps', () => {
  const a = item('a', { startTime: '09:00', endTime: '10:00' });
  const u = item('u'); // untimed sorts around midday — between the timed pair
  const b = item('b', { startTime: '15:30', endTime: '16:00' });

  it('reports minutes between consecutive timed items, untimed in between do not split them', () => {
    const p = planToday([a, u, b], NO_LEGS, 12 * 60);
    expect(p.gaps).toEqual([
      { afterItemId: 'a', untilItemId: 'b', freeMin: 330, untilMin: 15 * 60 + 30, active: true },
    ]);
  });

  it('marks gaps inactive once the next item has started, and skips back-to-back items', () => {
    const p = planToday([a, b], NO_LEGS, 17 * 60);
    expect(p.gaps[0].active).toBe(false);
    const tight = planToday(
      [item('x', { startTime: '09:00', endTime: '10:00' }), item('y', { startTime: '10:00' })],
      NO_LEGS,
      12 * 60,
    );
    expect(tight.gaps).toHaveLength(0);
  });
});

describe('planToday legs', () => {
  const a = item('a', { startTime: '09:00' });
  const b = item('b', { startTime: '10:00' });
  const c = item('c', { startTime: '11:00' });
  const legs: TodayLeg[] = [
    { id: 'l1', fromItemId: 'a', toItemId: 'b', mode: 'walk', durationMin: 12, summary: null, deepLink: 'https://x', chosen: false },
    { id: 'l2', fromItemId: 'a', toItemId: 'b', mode: 'transit', durationMin: 8, summary: null, deepLink: null, chosen: true },
    { id: 'l3', fromItemId: 'b', toItemId: 'c', mode: 'walk', durationMin: 5, summary: null, deepLink: null, chosen: false },
  ];

  it('pairs the previous/next item in day order, chosen leg preferred', () => {
    const p = planToday([a, b, c], legs, 12 * 60);
    const eb = p.earlier.find((e) => e.item.id === 'b')!;
    expect(eb.legIn?.id).toBe('l2');
    expect(eb.legOut?.id).toBe('l3');
    const ea = p.earlier.find((e) => e.item.id === 'a')!;
    expect(ea.legIn).toBeNull();
    expect(p.earlier.find((e) => e.item.id === 'c')!.legOut).toBeNull();
  });
});

describe('tripPhase / tripLive', () => {
  const range = { start: '2026-10-29', end: '2026-11-01' };

  it('undated when there is no window', () => {
    expect(tripPhase(null, '2026-10-30')).toEqual({ phase: 'undated' });
  });

  it('counts down before the window', () => {
    expect(tripPhase(range, '2026-10-25')).toEqual({ phase: 'before', daysUntil: 4, start: '2026-10-29' });
  });

  it('reports day index inside the window (inclusive ends)', () => {
    expect(tripPhase(range, '2026-10-29')).toMatchObject({ phase: 'during', dayIndex: 1, totalDays: 4 });
    expect(tripPhase(range, '2026-11-01')).toMatchObject({ phase: 'during', dayIndex: 4, totalDays: 4 });
  });

  it('reports days since after the window', () => {
    expect(tripPhase(range, '2026-11-03')).toEqual({ phase: 'after', daysSince: 2, end: '2026-11-01' });
  });

  it('tripLive is in-window or in_progress', () => {
    expect(tripLive('planning', tripPhase(range, '2026-10-30'))).toBe(true);
    expect(tripLive('planning', tripPhase(range, '2026-10-25'))).toBe(false);
    expect(tripLive('in_progress', tripPhase(null, '2026-10-30'))).toBe(true);
    expect(tripLive('completed', tripPhase(range, '2026-10-30'))).toBe(true);
  });
});

describe('fmtMin / safeZone', () => {
  it('formats minutes as HH:mm, wrapping past midnight', () => {
    expect(fmtMin(0)).toBe('00:00');
    expect(fmtMin(720)).toBe('12:00');
    expect(fmtMin(1500)).toBe('01:00');
  });

  it('safeZone keeps valid IANA zones and falls back otherwise', () => {
    expect(safeZone('Europe/Lisbon')).toBe('Europe/Lisbon');
    expect(safeZone('Not/AZone')).toBe('UTC');
    expect(safeZone(null)).toBe('UTC');
    expect(safeZone('Bogus', 'America/New_York')).toBe('America/New_York');
  });
});

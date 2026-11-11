import { describe, expect, it } from 'vitest';
import { dayTiming, locatedPairs, missingLegPairs } from '@/lib/domain/day-timing';

const itm = (
  id: string,
  startTime: string | null,
  endTime: string | null = null,
  durationMin: number | null = null,
  lat: number | null = null,
  lon: number | null = null,
) => ({ id, startTime, endTime, durationMin, lat, lon });

const leg = (from: string, to: string, durationMin: number | null, chosen = true) => ({
  fromItemId: from, toItemId: to, durationMin, chosen,
});

describe('locatedPairs', () => {
  it('pairs only consecutive items that both have coordinates', () => {
    const pairs = locatedPairs([
      itm('a', '09:00', null, null, 38.7, -9.1),
      itm('b', '10:00'), // no location — breaks the chain
      itm('c', '11:00', null, null, 38.71, -9.12),
      itm('d', '12:00', null, null, 38.72, -9.13),
    ]);
    expect(pairs.map((p) => `${p.from.id}>${p.to.id}`)).toEqual(['c>d']);
  });

  it('returns nothing for a single item or an empty day', () => {
    expect(locatedPairs([])).toEqual([]);
    expect(locatedPairs([itm('a', null, null, null, 1, 1)])).toEqual([]);
  });
});

describe('missingLegPairs', () => {
  it('keeps only pairs with no stored leg of any mode', () => {
    const pairs = [
      { from: { id: 'a' }, to: { id: 'b' } },
      { from: { id: 'c' }, to: { id: 'd' } },
    ];
    const missing = missingLegPairs(pairs, [leg('a', 'b', 12), leg('b', 'a', 12)]);
    expect(missing.map((p) => `${p.from.id}>${p.to.id}`)).toEqual(['c>d']);
  });
});

describe('dayTiming', () => {
  it('flags a hop where the gap is shorter than the leg', () => {
    const flags = dayTiming(
      [itm('a', '10:00', '10:30'), itm('b', '10:45')],
      [leg('a', 'b', 35)],
    );
    expect(flags).toEqual([{ fromId: 'a', toId: 'b', neededMin: 35, availableMin: 15 }]);
  });

  it('is silent when the gap fits the leg', () => {
    expect(dayTiming(
      [itm('a', '10:00', '10:30'), itm('b', '11:30')],
      [leg('a', 'b', 35)],
    )).toEqual([]);
  });

  it('uses startTime + durationMin when there is no endTime', () => {
    const flags = dayTiming(
      [itm('a', '10:00', null, 60), itm('b', '11:20')],
      [leg('a', 'b', 35)],
    );
    expect(flags).toEqual([{ fromId: 'a', toId: 'b', neededMin: 35, availableMin: 20 }]);
  });

  it('falls back to the previous start time when nothing else is known', () => {
    const flags = dayTiming(
      [itm('a', '10:00'), itm('b', '10:05')],
      [leg('a', 'b', 12)],
    );
    expect(flags).toEqual([{ fromId: 'a', toId: 'b', neededMin: 12, availableMin: 5 }]);
  });

  it('is silent when either item is missing a start time', () => {
    expect(dayTiming(
      [itm('a', null), itm('b', '10:45')],
      [leg('a', 'b', 35)],
    )).toEqual([]);
    expect(dayTiming(
      [itm('a', '10:00', '10:30'), itm('b', null)],
      [leg('a', 'b', 35)],
    )).toEqual([]);
  });

  it('is silent when the hop has no leg or the leg has no duration', () => {
    expect(dayTiming([itm('a', '10:00', '10:30'), itm('b', '10:45')], [])).toEqual([]);
    expect(dayTiming(
      [itm('a', '10:00', '10:30'), itm('b', '10:45')],
      [leg('a', 'b', null)],
    )).toEqual([]);
  });

  it('reads an endTime before the start as after midnight (overnight)', () => {
    // 23:00–01:00 event, next morning start 07:30 — plenty of room.
    expect(dayTiming(
      [itm('a', '23:00', '01:00'), itm('b', '07:30')],
      [leg('a', 'b', 35)],
    )).toEqual([]);
    // Same event followed at 01:20 — only 20 min for a 35 min leg.
    const flags = dayTiming(
      [itm('a', '23:00', '01:00'), itm('b', '01:20')],
      [leg('a', 'b', 35)],
    );
    expect(flags).toEqual([{ fromId: 'a', toId: 'b', neededMin: 35, availableMin: 20 }]);
  });

  it('prefers the chosen leg over alternatives', () => {
    const flags = dayTiming(
      [itm('a', '10:00', '10:30'), itm('b', '11:00')],
      [leg('a', 'b', 20, false), leg('a', 'b', 40, true)],
    );
    expect(flags).toEqual([{ fromId: 'a', toId: 'b', neededMin: 40, availableMin: 30 }]);
  });

  it('flags overlaps with a negative available gap', () => {
    const flags = dayTiming(
      [itm('a', '10:00', '12:00'), itm('b', '11:00')],
      [leg('a', 'b', 10)],
    );
    expect(flags).toEqual([{ fromId: 'a', toId: 'b', neededMin: 10, availableMin: -60 }]);
  });
});

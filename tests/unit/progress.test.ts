import { describe, expect, it } from 'vitest';
import { summarizeProgress, type ProgressInput } from '@/lib/domain/progress';

const base: ProgressInput = {
  options: [], scanned: false, scheduledItems: 0, daysCovered: 0, days: 4,
  chosenLegs: 0, expenses: 0, spent: 0, currency: 'USD',
};
const step = (p: ReturnType<typeof summarizeProgress>, key: string) => p.steps.find((s) => s.key === key)!;

describe('summarizeProgress', () => {
  it('starts with flights as the next step and nothing done', () => {
    const p = summarizeProgress(base);
    expect(p.next).toBe('flights');
    expect(p.steps.every((s) => s.state === 'todo')).toBe(true);
    expect(p.shortlistCount).toBe(0);
  });

  it('a finished scan without picks means flights are in progress', () => {
    const p = summarizeProgress({ ...base, scanned: true });
    expect(step(p, 'flights')).toMatchObject({ state: 'started', summary: 'Prices are in — pick a flight' });
  });

  it('shortlisted-but-unselected asks the group to select one', () => {
    const p = summarizeProgress({
      ...base,
      options: [
        { kind: 'flight', status: 'shortlisted', title: 'A' },
        { kind: 'flight', status: 'shortlisted', title: 'B' },
        { kind: 'flight', status: 'rejected', title: 'C' },
      ],
    });
    expect(step(p, 'flights')).toMatchObject({ state: 'started', summary: '2 options shortlisted — select one' });
    expect(p.shortlistCount).toBe(2);
  });

  it('a booked option beats a selected one in the summary', () => {
    const p = summarizeProgress({
      ...base,
      options: [
        { kind: 'lodging', status: 'selected', title: 'Hotel A' },
        { kind: 'lodging', status: 'booked', title: 'Hotel B' },
      ],
    });
    expect(step(p, 'stay')).toMatchObject({ state: 'done', summary: 'Booked: Hotel B' });
  });

  it('moves the next step along the flow as steps complete', () => {
    const chosen = [
      { kind: 'flight', status: 'selected', title: 'TAP · EWR→LIS' },
      { kind: 'lodging', status: 'selected', title: 'Hotel' },
    ];
    expect(summarizeProgress({ ...base, options: chosen }).next).toBe('activities');
    const withActs = [...chosen, { kind: 'activity', status: 'shortlisted', title: 'Museum' }];
    expect(summarizeProgress({ ...base, options: withActs }).next).toBe('itinerary');
    expect(summarizeProgress({ ...base, options: withActs, scheduledItems: 2, daysCovered: 1 }).next).toBeNull();
  });

  it('itinerary is done only when every day has something planned', () => {
    expect(step(summarizeProgress({ ...base, scheduledItems: 3, daysCovered: 2 }), 'itinerary'))
      .toMatchObject({ state: 'started', summary: '3 items planned · 2 of 4 days filled' });
    expect(step(summarizeProgress({ ...base, scheduledItems: 5, daysCovered: 4 }), 'itinerary').state).toBe('done');
  });

  it('summarizes routes and spending', () => {
    const p = summarizeProgress({ ...base, chosenLegs: 1, expenses: 2, spent: 51.6 });
    expect(step(p, 'transport')).toMatchObject({ state: 'done', summary: '1 route planned' });
    expect(step(p, 'budget')).toMatchObject({ state: 'started', summary: '2 expenses · $52 spent' });
  });
});

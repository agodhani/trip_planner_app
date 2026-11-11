import { describe, expect, it } from 'vitest';
import { buildRecap, recapToText, type RecapInput } from '@/lib/domain/recap';

const TRIP = {
  name: 'Lisbon week',
  status: 'in_progress',
  originCity: 'New York',
  destinationCity: 'Lisbon',
  currency: 'EUR',
};

const base = (over: Partial<RecapInput> = {}): RecapInput => ({
  trip: TRIP,
  dates: { start: '2026-12-04', end: '2026-12-07' },
  planLabel: null,
  days: ['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07'],
  travelers: [
    { id: 'tA', name: 'Ana' },
    { id: 'tB', name: 'Bo' },
  ],
  items: [],
  journal: [],
  expenses: [],
  plannedCents: null,
  ...over,
});

const item = (over: Partial<RecapInput['items'][number]> = {}) => ({
  id: 'i1',
  day: '2026-12-04',
  title: 'Thing',
  kind: 'place',
  startTime: null,
  endTime: null,
  sortOrder: 0,
  outcome: 'planned',
  outcomeNotes: null,
  rating: null,
  system: false,
  ...over,
});

describe('buildRecap — empty sections are omitted', () => {
  it('a fresh trip yields only the header', () => {
    const v = buildRecap(base({ days: [], dates: null, planLabel: 'A week in December' }));
    expect(v.timeline).toEqual([]);
    expect(v.numbers).toBeNull();
    expect(v.moments).toEqual([]);
    expect(v.moneySection).toBeNull();
    expect(v.header.dateLine).toBe('A week in December');
    const text = recapToText(v);
    expect(text).not.toContain('BY THE NUMBERS');
    expect(text).not.toContain('DAY BY DAY');
    expect(text).not.toContain('TOP MOMENTS');
    expect(text).not.toContain('MONEY');
  });

  it('expense-free trips have no money section but keep a timeline', () => {
    const v = buildRecap(base({ items: [item({ title: 'Walk', outcome: 'done' })] }));
    expect(v.moneySection).toBeNull();
    expect(v.timeline).toHaveLength(1);
    expect(v.numbers?.outcomes?.donePct).toBe(100);
  });
});

describe('buildRecap — by the numbers', () => {
  it('counts outcomes, percentage, day count, spend', () => {
    const v = buildRecap(
      base({
        items: [
          item({ id: 'a', outcome: 'done', rating: 5, title: 'Belém' }),
          item({ id: 'b', outcome: 'done', title: 'Tram' }),
          item({ id: 'c', outcome: 'skipped', title: 'Museum' }),
          item({ id: 'd', outcome: 'planned', title: 'Fado' }),
        ],
        expenses: [
          {
            id: 'e1',
            description: 'Dinner',
            category: 'food',
            amountBaseCents: 8000,
            paidByTravelerId: 'tA',
            shares: [
              { travelerId: 'tA', shareBaseCents: 4000 },
              { travelerId: 'tB', shareBaseCents: 4000 },
            ],
          },
        ],
        plannedCents: 50000,
      }),
    );
    const n = v.numbers!;
    expect(n.dayCount).toBe(4);
    expect(n.outcomes).toEqual({ done: 2, skipped: 1, changed: 0, planned: 1, total: 4, donePct: 50 });
    expect(n.topRated).toEqual({ title: 'Belém', rating: 5 });
    expect(n.spentCents).toBe(8000);
    expect(n.plannedCents).toBe(50000);
    expect(n.perPersonCents).toBe(4000);
  });
});

describe('buildRecap — timeline ordering', () => {
  it('orders days chronologically, items via orderDay, unscheduled last', () => {
    const v = buildRecap(
      base({
        items: [
          item({ id: 'z1', day: '2026-12-06', title: 'Late day', sortOrder: 0 }),
          item({ id: 'a2', day: '2026-12-04', title: 'Afternoon', startTime: '15:00', sortOrder: 2 }),
          item({ id: 'a1', day: '2026-12-04', title: 'Morning', startTime: '09:00', sortOrder: 1 }),
          item({ id: 'a3', day: '2026-12-04', title: 'Untimed', sortOrder: 0 }),
          item({ id: 'p1', day: null, title: 'Someday' }),
        ],
      }),
    );
    expect(v.timeline.map((d) => d.day)).toEqual(['2026-12-04', '2026-12-06', '']);
    expect(v.timeline[0].items.map((i) => i.title)).toEqual(['Morning', 'Untimed', 'Afternoon']);
    expect(v.timeline[0].label).toMatch(/^Day 1 · /);
    expect(v.timeline[2].label).toBe('Unscheduled');
    expect(v.timeline[0].items[0].timeLabel).toBe('09:00');
    expect(v.timeline[0].items[2].timeLabel).toBe('15:00');
    expect(v.timeline[0].items[1].timeLabel).toBeNull();
  });

  it('labels a day outside the resolved window with just its date', () => {
    const v = buildRecap(base({ days: [], items: [item({ day: '2026-12-04' })] }));
    expect(v.timeline[0].label).not.toContain('Day ');
  });
});

describe('buildRecap — top moments', () => {
  it('keeps 4–5★ items plus journal entries, interleaved chronologically', () => {
    const v = buildRecap(
      base({
        items: [
          item({ id: 'hi', day: '2026-12-06', title: 'Sunset sail', rating: 5, outcome: 'done' }),
          item({ id: 'ok', day: '2026-12-05', title: 'Decent lunch', rating: 4, outcome: 'done' }),
          item({ id: 'meh', day: '2026-12-05', title: 'Meh museum', rating: 3, outcome: 'skipped' }),
          item({ id: 'un', day: '2026-12-04', title: 'Unrated', outcome: 'done' }),
        ],
        journal: [
          { id: 'j2', day: '2026-12-06', body: 'Best day ever', author: 'Ana' },
          { id: 'j1', day: '2026-12-04', body: 'Landed!', author: 'Bo' },
        ],
      }),
    );
    expect(v.moments.map((m) => m.key)).toEqual(['j:j1', 'i:ok', 'i:hi', 'j:j2']);
    expect(v.moments.find((m) => m.key === 'i:hi')?.rating).toBe(5);
    expect(v.moments.find((m) => m.key === 'j:j2')?.author).toBe('Ana');
  });
});

describe('buildRecap — money uses real share math', () => {
  it('category totals, per-person nets and settle-up transfers', () => {
    // Ana paid €90 food split evenly; Bo paid €30 transport owed only by Ana.
    const v = buildRecap(
      base({
        expenses: [
          {
            id: 'e1',
            description: 'Dinners',
            category: 'food',
            amountBaseCents: 9000,
            paidByTravelerId: 'tA',
            shares: [
              { travelerId: 'tA', shareBaseCents: 4500 },
              { travelerId: 'tB', shareBaseCents: 4500 },
            ],
          },
          {
            id: 'e2',
            description: 'Taxi',
            category: 'transport',
            amountBaseCents: 3000,
            paidByTravelerId: 'tB',
            shares: [{ travelerId: 'tA', shareBaseCents: 3000 }],
          },
        ],
      }),
    );
    const m = v.moneySection!;
    expect(m.spentCents).toBe(12000);
    expect(m.perPersonCents).toBe(6000);
    expect(m.categories).toEqual([
      { category: 'food', totalCents: 9000 },
      { category: 'transport', totalCents: 3000 },
    ]);
    // Nets: Ana +9000-4500-3000=+1500; Bo -4500+3000=-1500 → Bo pays Ana €15.
    expect(m.balances).toEqual([
      { name: 'Ana', netCents: 1500 },
      { name: 'Bo', netCents: -1500 },
    ]);
    expect(m.transfers).toEqual([{ fromName: 'Bo', toName: 'Ana', cents: 1500 }]);
  });
});

describe('recapToText', () => {
  it('renders every populated section with real values', () => {
    const v = buildRecap(
      base({
        items: [item({ title: 'Belém Tower', outcome: 'done', rating: 5, outcomeNotes: 'went twice' })],
        journal: [{ id: 'j', day: '2026-12-04', body: 'Pasteis!', author: 'Ana' }],
        expenses: [
          {
            id: 'e',
            description: 'Dinner',
            category: 'food',
            amountBaseCents: 8000,
            paidByTravelerId: 'tA',
            shares: [
              { travelerId: 'tA', shareBaseCents: 4000 },
              { travelerId: 'tB', shareBaseCents: 4000 },
            ],
          },
        ],
      }),
    );
    const text = recapToText(v);
    expect(text).toContain('Lisbon week — In progress');
    expect(text).toContain('New York → Lisbon');
    expect(text).toContain('Ana, Bo');
    expect(text).toContain('BY THE NUMBERS');
    expect(text).toContain('4 days');
    expect(text).toContain('1 of 1 item done (100%)');
    expect(text).toContain('Top rated: Belém Tower ★★★★★');
    expect(text).toContain('DAY BY DAY');
    expect(text).toContain('Belém Tower ★★★★★ — Done · went twice');
    expect(text).toContain('TOP MOMENTS');
    expect(text).toContain('“Pasteis!” — Ana');
    expect(text).toContain('MONEY (EUR)');
    expect(text).toContain('€80.00');
    expect(text).toContain('Settle up: Bo pays Ana €40.00');
  });
});

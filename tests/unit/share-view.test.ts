import { describe, expect, it } from 'vitest';
import {
  buildShareView,
  linkIsActive,
  type ShareItemInput,
  type ShareOptionInput,
  type ShareViewInput,
} from '@/lib/domain/share-view';

const base = (over: Partial<ShareViewInput> = {}): ShareViewInput => ({
  trip: { name: 'Lisbon week', originCity: 'New York', destinationCity: 'Lisbon' },
  dates: { start: '2026-12-04', end: '2026-12-07' },
  planLabel: null,
  days: ['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07'],
  travelerNames: ['Ana Silva', 'Bo Chen'],
  options: [],
  items: [],
  ...over,
});

const leg = (over: Record<string, unknown> = {}) => ({
  segments: [
    {
      airlineCode: 'TP',
      airlineName: 'TAP Portugal',
      flightNumber: '202',
      from: { code: 'JFK' },
      to: { code: 'LIS' },
      departLocal: '2026-12-04T20:15',
      arriveLocal: '2026-12-05T08:00',
      durationMin: 405,
    },
  ],
  layovers: [],
  from: { code: 'JFK', name: 'John F. Kennedy' },
  to: { code: 'LIS', name: 'Humberto Delgado' },
  departLocal: '2026-12-04T20:15',
  arriveLocal: '2026-12-05T08:00',
  durationMin: 405,
  stops: 0,
  airlines: ['TP'],
  emissionsKg: 980,
  typicalEmissionsKg: 1100,
  ...over,
});

const flightData = {
  id: 'gf:abc',
  outbound: leg(),
  return: leg({
    from: { code: 'LIS' },
    to: { code: 'JFK' },
    departLocal: '2026-12-07T10:30',
    arriveLocal: '2026-12-07T14:05',
    segments: [
      {
        airlineCode: 'TP',
        airlineName: 'TAP Portugal',
        flightNumber: '201',
        from: { code: 'LIS' },
        to: { code: 'JFK' },
        departLocal: '2026-12-07T10:30',
        arriveLocal: '2026-12-07T14:05',
        durationMin: 515,
      },
    ],
    durationMin: 515,
  }),
  price: { total: 1320, perPerson: 660, currency: 'USD', isFrom: false },
  bookingUrl: 'https://flights.example/book',
  fetchedAt: '2026-10-30T00:00:00Z',
};

const option = (over: Partial<ShareOptionInput> = {}): ShareOptionInput => ({
  id: 'opt-1',
  kind: 'flight',
  status: 'selected',
  title: 'TAP Portugal · JFK→LIS · Thu, Dec 4 – Mon, Dec 7',
  data: flightData,
  priceAmount: 1320,
  priceCurrency: 'USD',
  bookingRef: 'ABC123',
  bookingUrl: 'https://flights.example/book',
  ...over,
});

const item = (over: Partial<ShareItemInput> = {}): ShareItemInput => ({
  id: 'i1',
  day: '2026-12-05',
  kind: 'activity',
  title: 'Alfama walk',
  startTime: '10:00',
  endTime: null,
  sortOrder: 10,
  system: false,
  notes: 'Meet at the miradouro',
  ...over,
});

/**
 * Every object key in the serialized view, recursively — the privacy
 * denylist is asserted against this list.
 */
function allKeys(v: unknown, acc: string[] = []): string[] {
  if (Array.isArray(v)) {
    for (const x of v) allKeys(x, acc);
  } else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      acc.push(k);
      allKeys(x, acc);
    }
  }
  return acc;
}

// Anything shaped like money-ledger, social, or account internals is banned.
const DENIED_KEYS = [
  'email',
  'password',
  'passwordHash',
  'tokenHash',
  'homeTimezone',
  'lastSeenAt',
  'role',
  'userId',
  'ownerId',
  'createdBy',
  'travelerId',
  'paidBy',
  'paidByTravelerId',
  'expense',
  'expenses',
  'expenseId',
  'split',
  'splitMethod',
  'shares',
  'shareBase',
  'exactAmount',
  'amountBase',
  'fxRate',
  'priceCents',
  'plannedCost',
  'plannedCurrency',
  'journal',
  'journalId',
  'comment',
  'comments',
  'vote',
  'votes',
  'voters',
  'outcome',
  'outcomeNotes',
  'rating',
  'spentOn',
  'location',
  'lat',
  'lon',
  'optionId',
  'tripId',
  'data',
  'source',
  'externalId',
  'priceAmount',
  'priceCurrency',
  'sortOrder',
  'locked',
  'unplanned',
  'durationMin',
  'revokedAt',
  'expiresAt',
  'createdAt',
  'updatedAt',
];

const RICH_INPUT = base({
  options: [
    option(),
    option({ id: 'opt-2', status: 'shortlisted', title: 'Shortlisted flight' }),
    option({ id: 'opt-3', status: 'rejected', title: 'Rejected flight' }),
    option({
      id: 'stay-1',
      kind: 'lodging',
      status: 'booked',
      title: 'Hotel Avenida',
      data: {
        name: 'Hotel Avenida',
        checkIn: '2026-12-04',
        checkOut: '2026-12-07',
        checkInTime: '3:00 PM',
        checkOutTime: '11:00 AM',
        totalPrice: 540,
        currency: 'EUR',
        amenities: ['wifi', 'pool'],
        images: ['https://img.example/1.jpg'],
        description: 'A long private description',
      },
      priceAmount: 540,
      priceCurrency: 'EUR',
      bookingRef: 'HTL9',
      bookingUrl: 'https://stay.example/book',
    }),
    option({
      id: 'act-1',
      kind: 'activity',
      status: 'selected',
      title: 'Selected activity option',
      data: { rating: 4.5 },
    }),
  ],
  items: [
    item(),
    item({
      id: 'i2',
      day: '2026-12-05',
      kind: 'meal',
      title: 'Dinner',
      startTime: '19:30',
      sortOrder: 20,
      notes: null,
    }),
    item({
      id: 'i3',
      day: '2026-12-05',
      kind: 'custom',
      title: 'Untimed morning errand',
      startTime: null,
      sortOrder: 5,
    }),
    item({
      id: 'i4',
      day: null,
      kind: 'activity',
      title: 'Unscheduled idea',
      startTime: null,
      sortOrder: 0,
    }),
    item({
      id: 'i5',
      kind: 'activity',
      title: 'Midday timed item',
      startTime: '12:00',
      sortOrder: 30,
      notes: null,
    }),
  ],
});

describe('buildShareView', () => {
  it('builds the header: name, route, dates, first names only', () => {
    const v = buildShareView(RICH_INPUT);
    expect(v.tripName).toBe('Lisbon week');
    expect(v.routeLine).toBe('New York → Lisbon');
    expect(v.dateLine).toBe('Fri, Dec 4 – Mon, Dec 7');
    // First names only — surnames must not leak.
    expect(v.travelersLine).toBe('Ana, Bo');
    expect(JSON.stringify(v)).not.toContain('Silva');
    expect(JSON.stringify(v)).not.toContain('Chen');
  });

  it('includes only selected/booked flight and lodging options', () => {
    const v = buildShareView(RICH_INPUT);
    expect(v.flights.map((f) => f.id)).toEqual(['opt-1']);
    expect(v.stays.map((s) => s.id)).toEqual(['stay-1']);
    // shortlisted/rejected/other-kind options are all excluded.
    expect(JSON.stringify(v)).not.toContain('Shortlisted flight');
    expect(JSON.stringify(v)).not.toContain('Rejected flight');
    expect(JSON.stringify(v)).not.toContain('Selected activity option');
  });

  it('maps flight legs: times, airports, airlines, booking, price', () => {
    const v = buildShareView(RICH_INPUT);
    const f = v.flights[0];
    expect(f.legs.map((l) => l.direction)).toEqual(['Outbound', 'Return']);
    const out = f.legs[0];
    expect(out.fromCode).toBe('JFK');
    expect(out.toCode).toBe('LIS');
    expect(out.departTime).toBe('20:15');
    expect(out.arriveTime).toBe('08:00 +1');
    expect(out.stopsLabel).toBe('nonstop');
    expect(out.airlineLabel).toBe('TAP Portugal');
    expect(out.flightNumbers).toBe('TP 202');
    expect(f.bookingRef).toBe('ABC123');
    expect(f.bookingUrl).toBe('https://flights.example/book');
    expect(f.priceText).toBe('$1,320');
    expect(f.booked).toBe(false);
  });

  it('maps lodging: name plus check-in/out', () => {
    const v = buildShareView(RICH_INPUT);
    const s = v.stays[0];
    expect(s.name).toBe('Hotel Avenida');
    expect(s.booked).toBe(true);
    expect(s.checkIn).toBe('2026-12-04');
    expect(s.checkOut).toBe('2026-12-07');
    expect(s.dateLine).toBe('Fri, Dec 4 – Mon, Dec 7 · 3 nights');
    expect(s.checkInTime).toBe('3:00 PM');
    expect(s.checkOutTime).toBe('11:00 AM');
    expect(s.priceText).toBe('€540');
    // Heavy provider payload never reaches the view.
    expect(JSON.stringify(s)).not.toContain('pool');
    expect(JSON.stringify(s)).not.toContain('private description');
  });

  it('orders days with orderDay and puts the unscheduled bucket last', () => {
    const v = buildShareView(RICH_INPUT);
    expect(v.days.map((d) => d.day)).toEqual(['2026-12-05', '']);
    const day = v.days[0];
    expect(day.label).toBe('Day 2 · Sat, Dec 5');
    // orderDay: timed items chronological, untimed in the midday cluster.
    expect(day.items.map((i) => i.title)).toEqual([
      'Alfama walk',
      'Midday timed item',
      'Untimed morning errand',
      'Dinner',
    ]);
    expect(day.items[0].timeLabel).toBe('10:00');
    expect(day.items[2].timeLabel).toBeNull();
    expect(v.days[1].label).toBe('Unscheduled');
  });

  it('shows the plan label when the trip has no explicit dates', () => {
    const v = buildShareView(
      base({ dates: null, planLabel: 'Weekends in Nov 2026' }),
    );
    expect(v.dateLine).toBe('Weekends in Nov 2026');
    const unset = buildShareView(base({ dates: null, planLabel: null }));
    expect(unset.dateLine).toBe('Dates not set');
  });

  it('tolerates malformed option data instead of crashing', () => {
    const v = buildShareView(
      base({
        options: [
          option({ id: 'bad', data: { outbound: { bogus: true } }, priceAmount: null }),
        ],
      }),
    );
    expect(v.flights).toHaveLength(1);
    expect(v.flights[0].legs).toEqual([]);
    expect(v.flights[0].priceText).toBeNull();
  });

  it('emits no denylist keys anywhere in the serialized view', () => {
    const v = buildShareView(RICH_INPUT);
    const keys = new Set(allKeys(JSON.parse(JSON.stringify(v))));
    for (const banned of DENIED_KEYS) {
      expect(keys.has(banned), `key "${banned}" must not appear`).toBe(false);
    }
  });

  it('emits no forbidden values (emails, expense/journal content)', () => {
    const withSecrets = base({
      options: [option()],
      items: [item()],
    });
    const json = JSON.stringify(buildShareView(withSecrets));
    for (const fragment of [
      'ana@example.com',
      'password',
      'expense',
      'journal',
      'vote',
      'comment',
    ]) {
      expect(json.toLowerCase()).not.toContain(fragment);
    }
  });
});

describe('linkIsActive', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  it('is active when unrevoked and unexpired', () => {
    expect(linkIsActive({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(
      linkIsActive(
        { revokedAt: null, expiresAt: new Date('2026-11-30T00:00:00Z') },
        now,
      ),
    ).toBe(true);
  });
  it('is inactive when revoked or expired', () => {
    expect(
      linkIsActive({ revokedAt: new Date('2026-10-01T00:00:00Z'), expiresAt: null }, now),
    ).toBe(false);
    expect(
      linkIsActive(
        { revokedAt: null, expiresAt: new Date('2026-10-30T12:00:00Z') },
        now,
      ),
    ).toBe(false);
    expect(
      linkIsActive(
        { revokedAt: null, expiresAt: new Date('2026-10-01T00:00:00Z') },
        now,
      ),
    ).toBe(false);
  });
});

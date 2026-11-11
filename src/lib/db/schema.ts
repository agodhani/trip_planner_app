import { isNull, sql } from 'drizzle-orm';
import type { ExpenseCategory } from '@/lib/domain/budget';
import type { DateStrategy, TimePrefs } from '@/lib/domain/dates/strategy';
import type { PlaceRef } from '@/lib/providers/types';
import {
  bigserial,
  boolean,
  char,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const tripStatus = pgEnum('trip_status', [
  'planning',
  'booked',
  'in_progress',
  'completed',
  'cancelled',
]);

export const memberRole = pgEnum('member_role', ['owner', 'editor', 'viewer']);

export const cabinClass = pgEnum('cabin_class', [
  'economy',
  'premium_economy',
  'business',
  'first',
]);

export const maxStops = pgEnum('max_stops', ['any', 'nonstop', 'one', 'two']);

export const flightSearchStatus = pgEnum('flight_search_status', [
  'queued',
  'running',
  'done',
  'failed',
  'cancelled',
]);

export const optionKind = pgEnum('option_kind', [
  'flight',
  'lodging',
  'activity',
  'transport',
  'other',
]);

export const optionStatus = pgEnum('option_status', [
  'shortlisted',
  'selected',
  'booked',
  'rejected',
]);

export const itemKind = pgEnum('item_kind', [
  'flight_depart',
  'flight_arrive',
  'checkin',
  'checkout',
  'activity',
  'transport',
  'meal',
  'custom',
]);

export const legMode = pgEnum('leg_mode', [
  'walk',
  'transit',
  'drive',
  'bike',
  'other',
]);

export const legSource = pgEnum('leg_source', [
  'osrm',
  'fossgis',
  'transitous',
  'manual',
]);

export const expenseCategory = pgEnum('expense_category', [
  'flights',
  'lodging',
  'food',
  'activities',
  'transport',
  'shopping',
  'fees',
  'other',
]);

export const splitMethod = pgEnum('split_method', ['equal', 'exact', 'shares']);

export const itemOutcome = pgEnum('item_outcome', [
  'planned',
  'done',
  'skipped',
  'changed',
]);

export const pairAvail = pgEnum('pair_avail', ['works', 'maybe', 'no']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  homeTimezone: text('home_timezone').notNull().default('America/New_York'),
  defaultCurrency: char('default_currency', { length: 3 })
    .notNull()
    .default('USD'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: tripStatus('status').notNull().default('planning'),
  origin: jsonb('origin').$type<PlaceRef>().notNull(),
  destination: jsonb('destination').$type<PlaceRef>().notNull(),
  adults: integer('adults').notNull().default(1),
  childrenAges: integer('children_ages').array().notNull().default([]),
  cabin: cabinClass('cabin').notNull().default('economy'),
  maxStops: maxStops('max_stops').notNull().default('any'),
  dateStrategy: jsonb('date_strategy').$type<DateStrategy>().notNull(),
  timePrefs: jsonb('time_prefs')
    .$type<TimePrefs>()
    .notNull()
    .default({}),
  startDate: date('start_date'),
  endDate: date('end_date'),
  currency: char('currency', { length: 3 }).notNull().default('USD'),
  // Trip budget caps, in the trip currency. budgetByCategory holds integer
  // cents per expense_category key (partial map; absent key = no cap).
  budgetTotal: numeric('budget_total', { precision: 12, scale: 2 }),
  budgetByCategory: jsonb('budget_by_category').$type<
    Partial<Record<ExpenseCategory, number>>
  >(),
  version: integer('version').notNull().default(1),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tripMembers = pgTable(
  'trip_members',
  {
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Presence heartbeat: written at most once per user per minute by the
    // trip pulse action.
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId] })],
);

export const tripInvites = pgTable('trip_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  role: memberRole('role').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  uses: integer('uses').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    // Null means the link lives until revoked — no expiry.
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('share_links_trip_idx').on(t.tripId)],
);

export const travelers = pgTable(
  'travelers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('travelers_trip_user_uniq')
      .on(t.tripId, t.userId)
      .where(sql`${t.userId} is not null`),
  ],
);

export const providerCache = pgTable(
  'provider_cache',
  {
    key: text('key').primaryKey(),
    provider: text('provider').notNull(),
    operation: text('operation').notNull(),
    request: jsonb('request').notNull(),
    result: jsonb('result').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('provider_cache_expires_at_idx').on(t.expiresAt)],
);

export const providerCalls = pgTable(
  'provider_calls',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    provider: text('provider').notNull(),
    operation: text('operation').notNull(),
    cacheHit: boolean('cache_hit').notNull(),
    ok: boolean('ok').notNull(),
    errorKind: text('error_kind'),
    durationMs: integer('duration_ms').notNull(),
    credits: integer('credits').notNull().default(0),
    tripId: uuid('trip_id').references(() => trips.id, {
      onDelete: 'set null',
    }),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('provider_calls_provider_created_idx').on(t.provider, t.createdAt)],
);

export const flightSearches = pgTable('flight_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  request: jsonb('request').notNull(),
  status: flightSearchStatus('status').notNull().default('queued'),
  total: integer('total').notNull(),
  completed: integer('completed').notNull().default(0),
  result: jsonb('result'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const tripOptions = pgTable(
  'trip_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    kind: optionKind('kind').notNull(),
    source: text('source').notNull(),
    externalId: text('external_id'),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    data: jsonb('data').notNull(),
    priceAmount: numeric('price_amount', { precision: 12, scale: 2 }),
    priceCurrency: char('price_currency', { length: 3 }),
    lat: doublePrecision('lat'),
    lon: doublePrecision('lon'),
    status: optionStatus('status').notNull().default('shortlisted'),
    bookingRef: text('booking_ref'),
    bookingUrl: text('booking_url'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft delete ("the bin"): set = removed, recoverable via restoreOption;
    // votes/comments survive because nothing cascades until purgeOption.
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    uniqueIndex('trip_options_external_uniq')
      .on(t.tripId, t.kind, t.source, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

/**
 * Soft-delete predicate: a binned option (removedAt set) is invisible to
 * every listing, tally, anchor and link lookup. Apply at every trip_options
 * read — exceptions are the bin itself (listRemovedOptions), mutation guards
 * that must find binned rows (delete/restore/purge, addOption's conflict
 * path), and the pulse feed's optionKind join (an 'option.removed' event
 * still needs the removed row's kind to map to the right tab).
 */
export const optionIsActive = isNull(tripOptions.removedAt);

/**
 * Price Watch: one row per option per refresh. The option's own priceAmount
 * stays the shortlist-time baseline — these rows are the observed history:
 * priceCents null means the itinerary was still listed but carried no price,
 * available false means it no longer appeared in the provider's results.
 */
export const optionPriceChecks = pgTable(
  'option_price_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    optionId: uuid('option_id')
      .notNull()
      .references(() => tripOptions.id, { onDelete: 'cascade' }),
    checkedAt: timestamp('checked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    priceCents: integer('price_cents'),
    currency: text('currency'),
    available: boolean('available').notNull(),
  },
  (t) => [index('option_price_checks_option_idx').on(t.optionId, t.checkedAt)],
);

export const optionVotes = pgTable(
  'option_votes',
  {
    optionId: uuid('option_id')
      .notNull()
      .references(() => tripOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: smallint('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.optionId, t.userId] }),
    check('option_votes_value_chk', sql`${t.value} in (-1, 1)`),
  ],
);

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  optionId: uuid('option_id').references(() => tripOptions.id, {
    onDelete: 'cascade',
  }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const itineraryItems = pgTable(
  'itinerary_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    day: date('day'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    sortOrder: integer('sort_order').notNull().default(0),
    kind: itemKind('kind').notNull(),
    optionId: uuid('option_id').references(() => tripOptions.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    location: jsonb('location'),
    durationMin: integer('duration_min'),
    locked: boolean('locked').notNull().default(false),
    system: boolean('system').notNull().default(false),
    notes: text('notes'),
    plannedCost: numeric('planned_cost', { precision: 12, scale: 2 }),
    plannedCurrency: char('planned_currency', { length: 3 }),
    outcome: itemOutcome('outcome').notNull().default('planned'),
    outcomeNotes: text('outcome_notes'),
    rating: smallint('rating'),
    unplanned: boolean('unplanned').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('itinerary_items_trip_day_idx').on(t.tripId, t.day, t.sortOrder),
    check('itinerary_items_rating_chk', sql`${t.rating} between 1 and 5`),
  ],
);

export const transportLegs = pgTable(
  'transport_legs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    fromItemId: uuid('from_item_id')
      .notNull()
      .references(() => itineraryItems.id, { onDelete: 'cascade' }),
    toItemId: uuid('to_item_id')
      .notNull()
      .references(() => itineraryItems.id, { onDelete: 'cascade' }),
    mode: legMode('mode').notNull(),
    durationMin: integer('duration_min'),
    distanceM: integer('distance_m'),
    summary: text('summary'),
    source: legSource('source').notNull(),
    details: jsonb('details'),
    deepLink: text('deep_link'),
    chosen: boolean('chosen').notNull().default(false),
    computedAt: timestamp('computed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('transport_legs_pair_mode_uniq').on(
      t.fromItemId,
      t.toItemId,
      t.mode,
    ),
  ],
);

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  category: expenseCategory('category').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  fxRate: numeric('fx_rate', { precision: 18, scale: 8 }).notNull(),
  amountBase: numeric('amount_base', { precision: 12, scale: 2 }).notNull(),
  spentOn: date('spent_on').notNull(),
  paidByTravelerId: uuid('paid_by_traveler_id')
    .notNull()
    .references(() => travelers.id, { onDelete: 'restrict' }),
  splitMethod: splitMethod('split_method').notNull(),
  optionId: uuid('option_id').references(() => tripOptions.id, {
    onDelete: 'set null',
  }),
  itineraryItemId: uuid('itinerary_item_id').references(() => itineraryItems.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const expenseShares = pgTable(
  'expense_shares',
  {
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    travelerId: uuid('traveler_id')
      .notNull()
      .references(() => travelers.id, { onDelete: 'cascade' }),
    shareBase: numeric('share_base', { precision: 12, scale: 2 }).notNull(),
    shares: numeric('shares', { precision: 10, scale: 4 }),
    exactAmount: numeric('exact_amount', { precision: 12, scale: 2 }),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.travelerId] })],
);

/**
 * Group availability on candidate date pairs. Pairs are strategy-derived
 * strings (not DB rows), so depart/back are stored as 'YYYY-MM-DD' text;
 * a one-way pair stores '' for back — Postgres NULLs can't sit in a PK.
 */
export const datePairPrefs = pgTable(
  'date_pair_prefs',
  {
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    depart: text('depart').notNull(),
    back: text('back').notNull().default(''),
    value: pairAvail('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.userId, t.depart, t.back] }),
    index('date_pair_prefs_trip_idx').on(t.tripId),
  ],
);

/**
 * Group-assigned trip tasks ("Who's on it") — distinct from the derived
 * planning checklist. Assignee points at a travelers row so non-member
 * travelers can hold tasks; SET NULL keeps the task when a traveler is
 * removed. doneAt/doneBy record who closed it for the activity feed.
 */
export const tripTasks = pgTable(
  'trip_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    details: text('details'),
    assigneeTravelerId: uuid('assignee_traveler_id').references(
      () => travelers.id,
      { onDelete: 'set null' },
    ),
    dueOn: date('due_on'),
    done: boolean('done').notNull().default(false),
    doneAt: timestamp('done_at', { withTimezone: true }),
    doneBy: uuid('done_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('trip_tasks_trip_idx').on(t.tripId, t.sortOrder)],
);

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  day: date('day'),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const activityEvents = pgTable(
  'activity_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    verb: text('verb').notNull(),
    summary: text('summary').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('activity_events_trip_created_idx').on(t.tripId, t.createdAt),
  ],
);

export const tripStatusValues = tripStatus.enumValues;
export type TripStatus = (typeof tripStatusValues)[number];
export type MemberRole = (typeof memberRole.enumValues)[number];
export type ExpenseCategoryValue = (typeof expenseCategory.enumValues)[number];
export type OptionKindValue = (typeof optionKind.enumValues)[number];

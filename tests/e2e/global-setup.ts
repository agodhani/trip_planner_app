import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const TEST_DB =
  'postgres://tripplanner:tripplanner@localhost:5434/tripplanner_test';

export default async function globalSetup() {
  const sql = postgres(TEST_DB, { max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  await sql`
    TRUNCATE TABLE
      activity_events, comments, date_pair_prefs, expense_shares, expenses, flight_searches,
      itinerary_items, option_votes, provider_cache, provider_calls,
      sessions, share_links, transport_legs, travelers, trip_invites,
      trip_members, trip_options, trip_tasks, trips, users
    CASCADE
  `;
  await sql.end();
}

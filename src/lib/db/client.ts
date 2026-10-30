import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  __tpSql?: postgres.Sql;
};

const sql = (globalForDb.__tpSql ??= postgres(env.DATABASE_URL, {
  max: 10,
}));

export const db = drizzle(sql, { schema });
export { schema };

import postgres from 'postgres';

const TEST_DB =
  'postgres://tripplanner:tripplanner@localhost:5434/tripplanner_test';

/**
 * Direct access to the e2e database for seeding rows the UI can't produce —
 * same connection the Playwright webServer talks to. Keep it test-only.
 */
export async function withTestDb<T>(
  fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export async function userIdByEmail(email: string): Promise<string> {
  return withTestDb(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${email} LIMIT 1
    `;
    if (!rows[0]) throw new Error(`no user for ${email}`);
    return rows[0].id;
  });
}

import { expect, test, type Page } from '@playwright/test';
import {
  createAroundDec4Trip,
  PASSWORD,
  signUp,
  tripIdFromUrl,
  uniqueEmail,
} from './helpers';
import { userIdByEmail, withTestDb } from './db';

const outboundRows = (page: Page) =>
  page.getByTestId('outbound-table').locator('tbody tr');

/**
 * Shortlist a real fixture round trip: cheapest outbound of the auto-opened
 * pair, then the first return row. Both legs are in the recorded fixtures so
 * a price refresh re-finds them.
 */
async function shortlistFixtureRoundTrip(page: Page) {
  await page.getByRole('link', { name: 'Flights', exact: true }).click();
  await page.getByRole('button', { name: 'Search flights' }).click();
  await expect(outboundRows(page).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Select this outbound' }).first().click();
  await expect(page.getByText('Your outbound', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Show returns outside your time window' }).check();
  const returnRows = page.getByTestId('returns-table').locator('tbody tr');
  await expect(returnRows.first()).toBeVisible({ timeout: 60_000 });
  await returnRows.first().getByRole('button', { name: 'Shortlist this round trip' }).click();
  await expect(page.getByText('Shortlisted flights')).toBeVisible({ timeout: 15_000 });
}

/** google_flights-shaped itinerary whose ids are absent from the fixtures. */
const GONE_DATA = {
  id: 'zz-gone-001',
  outbound: {
    segments: [
      {
        airlineCode: 'ZZ', airlineName: 'Zed Air', flightNumber: '999',
        from: { code: 'JFK' }, to: { code: 'LIS' },
        departLocal: '2026-12-04T23:55', arriveLocal: '2026-12-05T11:00', durationMin: 425,
      },
    ],
    layovers: [],
    from: { code: 'JFK' }, to: { code: 'LIS' },
    departLocal: '2026-12-04T23:55', arriveLocal: '2026-12-05T11:00',
    fromTz: 'America/New_York', toTz: 'Europe/Lisbon',
    durationMin: 425, stops: 0, airlines: ['ZZ'],
  },
  return: {
    segments: [
      {
        airlineCode: 'ZZ', airlineName: 'Zed Air', flightNumber: '998',
        from: { code: 'LIS' }, to: { code: 'JFK' },
        departLocal: '2026-12-07T23:00', arriveLocal: '2026-12-08T03:00', durationMin: 480,
      },
    ],
    layovers: [],
    from: { code: 'LIS' }, to: { code: 'JFK' },
    departLocal: '2026-12-07T23:00', arriveLocal: '2026-12-08T03:00',
    fromTz: 'Europe/Lisbon', toTz: 'America/New_York',
    durationMin: 480, stops: 0, airlines: ['ZZ'],
  },
  price: { total: 555, perPerson: 555, currency: 'USD', isFrom: false },
  bookingUrl: '', isBest: false, fetchedAt: '2026-10-29T00:00:00.000Z',
};

test('price watch: refresh reprices shortlisted flights, gone one flagged', async ({ page }) => {
  const email = uniqueEmail('watch');
  await signUp(page, 'E2E Watcher', email);
  await createAroundDec4Trip(page);
  const tripId = tripIdFromUrl(page);
  await shortlistFixtureRoundTrip(page);

  // Seed a second watched flight the fixtures no longer list.
  const userId = await userIdByEmail(email);
  await withTestDb(async (sql) => {
    await sql`
      INSERT INTO trip_options ${sql({
        trip_id: tripId,
        kind: 'flight',
        source: 'google_flights',
        external_id: 'zz-gone-001:2026-12-04:2026-12-07',
        title: 'Zed Air · JFK→LIS · Thu, Dec 4 – Mon, Dec 7',
        subtitle: 'Out ZZ 999 (nonstop) · Back ZZ 998 (nonstop)',
        data: sql.json(GONE_DATA),
        price_amount: '555.00',
        price_currency: 'USD',
        status: 'shortlisted',
        created_by: userId,
      })}
    `;
  });

  await page.getByRole('link', { name: 'Shortlist', exact: true }).click();
  await expect(page.getByText('Zed Air', { exact: false })).toBeVisible({ timeout: 15_000 });
  const checkBtn = page.getByRole('button', { name: 'Check prices' });
  await expect(checkBtn).toBeVisible();
  await checkBtn.click();

  // The fixture itinerary is still listed — fresh check, no "gone" flag —
  // while the seeded one comes back "no longer listed".
  await expect(page.getByText('no longer listed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('checked just now').first()).toBeVisible();
  // Both watch rows carry the staleness stamp.
  await expect(page.getByText('checked just now')).toHaveCount(2);
});

test('price watch: a price drop vs baseline shows the delta chip', async ({ page }) => {
  const email = uniqueEmail('watchdelta');
  await signUp(page, 'E2E Delta', email);
  await createAroundDec4Trip(page);
  const tripId = tripIdFromUrl(page);
  await shortlistFixtureRoundTrip(page);

  // Static fixtures can't produce a same-request delta — seed the check row
  // a 10% drop below the frozen baseline instead.
  const option = await withTestDb(async (sql) => {
    const rows = await sql<{ id: string; price_amount: string; price_currency: string | null }[]>`
      SELECT id, price_amount, price_currency FROM trip_options
      WHERE trip_id = ${tripId} AND source = 'google_flights'
      LIMIT 1
    `;
    return rows[0];
  });
  const baselineCents = Math.round(Number(option.price_amount) * 100);
  await withTestDb(async (sql) => {
    await sql`
      INSERT INTO option_price_checks ${sql({
        option_id: option.id,
        price_cents: Math.round(baselineCents * 0.9),
        currency: option.price_currency ?? 'USD',
        available: true,
      })}
    `;
  });

  await page.getByRole('link', { name: 'Shortlist', exact: true }).click();
  await expect(page.getByText('−10.0%')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('checked just now').first()).toBeVisible();
});

test('price watch: viewers see checks but not the refresh control', async ({ page, browser }) => {
  await signUp(page, 'E2E Owner', uniqueEmail('watchowner'));
  await createAroundDec4Trip(page);
  await shortlistFixtureRoundTrip(page);
  await page.getByRole('link', { name: 'Shortlist', exact: true }).click();
  await page.getByRole('button', { name: 'Check prices' }).click();
  await expect(page.getByText('checked just now').first()).toBeVisible({ timeout: 15_000 });
  const shortlistUrl = page.url();

  // Invite a viewer.
  await page.getByRole('link', { name: 'People' }).click();
  await page.locator('select[name="role"]').selectOption('viewer');
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = await page.locator('code').first().textContent();
  expect(inviteUrl).toContain('/invite/');

  const ctx = await browser.newContext();
  const viewer = await ctx.newPage();
  await viewer.goto(inviteUrl!);
  await viewer.getByRole('link', { name: 'Sign up to join' }).click();
  await viewer.getByLabel('Name').fill('E2E Viewer');
  await viewer.getByLabel('Email').fill(uniqueEmail('viewer'));
  await viewer.getByLabel('Password').fill(PASSWORD);
  await viewer.getByRole('button', { name: 'Sign up' }).click();
  await expect(viewer).toHaveURL(/\/invite\//);
  await viewer.getByRole('button', { name: /Join / }).click();
  // The join must land (membership row committed) before the trip URL works —
  // non-members get a 404.
  await expect(viewer).toHaveURL(/\/trips\/[0-9a-f-]{36}/);

  await viewer.goto(shortlistUrl);
  // The check results are read-only for viewers — no refresh control.
  await expect(viewer.getByText('checked just now').first()).toBeVisible({ timeout: 15_000 });
  await expect(viewer.getByRole('button', { name: 'Check prices' })).toHaveCount(0);
  await ctx.close();
});

import { expect, test, type Page } from '@playwright/test';
import { pickPlace, signUp, uniqueEmail } from './helpers';

async function createAroundDec4Trip(page: Page, returnWindow = true) {
  await page.goto('/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByRole('button', { name: 'Around a date' }).click();
  await page.getByLabel('Around', { exact: true }).fill('2026-12-04');
  if (returnWindow) await page.getByText('Return departs between').click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
}

const outboundRows = (page: Page) => page.getByTestId('outbound-table').locator('tbody tr');

test('flights: scan, pick pair, returns, shortlist, select, vote, manual', async ({ page }) => {
  await signUp(page, 'E2E Flyer', uniqueEmail('flyer'));
  await createAroundDec4Trip(page);
  // Overview points at flights first.
  await expect(page.getByText('Next step')).toBeVisible();
  await expect(page.getByText('Find flights')).toBeVisible();
  await page.getByRole('link', { name: 'Flights', exact: true }).click();

  await page.getByRole('button', { name: 'Search flights' }).click();
  // Fixture replay is fast; wait for priced date cells. The cheapest opens by itself.
  const cell = page.locator('button', { hasText: '$' }).first();
  await expect(cell).toBeVisible({ timeout: 60_000 });
  await expect(outboundRows(page).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('button[aria-pressed="true"]', { hasText: '$' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Refresh prices' })).toBeVisible();

  await cell.click();
  await expect(page.getByText('Loading…')).toBeHidden({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Choose return' }).first().click();
  // Step 2 pins the outbound and swaps in the return list.
  await expect(page.getByText('Your outbound', { exact: true })).toBeVisible();
  await expect(page.getByTestId('outbound-table')).toHaveCount(0);
  // The 5pm-ET return window hides every fixture return — opt into seeing all.
  await expect(page.getByText('No return flights inside your time window')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('checkbox', { name: 'Show returns outside your time window' }).check();
  const returnRows = page.getByTestId('returns-table').locator('tbody tr');
  await expect(returnRows.first()).toBeVisible({ timeout: 60_000 });

  await returnRows.first().getByRole('button', { name: 'Shortlist', exact: true }).click();
  await expect(page.getByText('Shortlisted flights')).toBeVisible({ timeout: 15_000 });
  await expect(returnRows.first().getByText('Shortlisted')).toBeVisible();
  await expect(page.getByTestId('tab-shortlist-count')).toHaveText('1');

  // Back to step 1 keeps everything working.
  await page.getByRole('button', { name: 'Change outbound' }).click();
  await expect(outboundRows(page).first()).toBeVisible();

  await page.getByRole('button', { name: 'Select' }).first().click();
  await expect(page.getByText('selected').first()).toBeVisible();
  await expect(page.getByTestId('tab-done-flights')).toBeVisible();

  await page.getByRole('button', { name: 'Vote up' }).first().click();
  await page.getByLabel('Option comment').first().fill('Looks good!');
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Looks good!')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByLabel('Airline code').fill('DL');
  await page.getByLabel('Flight number').fill('272');
  await page.getByLabel('From airport').fill('JFK');
  await page.getByLabel('To airport').fill('LIS');
  await page.getByLabel('Departs', { exact: true }).fill('2026-12-04T20:15');
  await page.getByLabel('Arrives', { exact: true }).fill('2026-12-05T08:00');
  // No price given — blank optional fields must not block the save.
  await page.getByRole('button', { name: 'Add flight' }).click();
  await expect(page.getByText(/^DL 272 · JFK→LIS/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('manual', { exact: true }).first()).toBeVisible();

  // Overview reflects the selection and moves on to the stay.
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByText(/^Selected: /).first()).toBeVisible();
  await expect(page.getByText('Find a place to stay')).toBeVisible();
});

test('flights: shortlisting the same flight from two tabs never crashes or duplicates', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signUp(page, 'E2E Doubler', uniqueEmail('double'));
  await createAroundDec4Trip(page, false);
  await page.getByRole('link', { name: 'Flights', exact: true }).click();
  await page.getByRole('button', { name: 'Search flights' }).click();
  await expect(outboundRows(page).first()).toBeVisible({ timeout: 60_000 });

  // A second tab (or a second member) has the same results open — stale until it refreshes.
  const tab2 = await context.newPage();
  tab2.on('pageerror', (e) => errors.push(e.message));
  await tab2.goto(page.url());
  await expect(outboundRows(tab2).first()).toBeVisible({ timeout: 60_000 });

  await outboundRows(page).first().getByRole('button', { name: 'Shortlist', exact: true }).click();
  await expect(outboundRows(page).first().getByText('Shortlisted')).toBeVisible({ timeout: 15_000 });
  await outboundRows(tab2).first().getByRole('button', { name: 'Shortlist', exact: true }).click();
  await expect(outboundRows(tab2).first().getByText('Shortlisted')).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
  await expect(tab2.getByText('Could not shortlist')).toHaveCount(0);
  await page.getByRole('link', { name: 'Shortlist', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Flights (1)' })).toBeVisible();
});

test('flights: switch between date pairs, rapid clicks, error cell', async ({ page }) => {
  await signUp(page, 'E2E Switcher', uniqueEmail('switch'));
  await createAroundDec4Trip(page);
  await page.getByRole('link', { name: 'Flights', exact: true }).click();
  await page.getByRole('button', { name: 'Search flights' }).click();

  const pricedCells = page.locator('button', { hasText: '$' });
  await expect(pricedCells.first()).toBeVisible({ timeout: 60_000 });
  expect(await pricedCells.count()).toBeGreaterThan(1);

  // Switch between priced pairs — each must reload the results table.
  for (const i of [0, 1, 0]) {
    await pricedCells.nth(i).click();
    await expect(pricedCells.nth(i)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Loading…')).toBeHidden({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Choose return' }).first())
      .toBeVisible({ timeout: 30_000 });
  }

  // Rapid switching — the last click must win, no stale rows or crash.
  await pricedCells.nth(0).click();
  await pricedCells.nth(1).click();
  await expect(pricedCells.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Choose return' }).first())
    .toBeVisible({ timeout: 30_000 });

  // Switching pairs while on the return step resets to step 1.
  await page.getByRole('button', { name: 'Choose return' }).first().click();
  await expect(page.getByText('Your outbound', { exact: true })).toBeVisible();
  await pricedCells.nth(0).click();
  await expect(page.getByText('Your outbound', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Choose return' }).first()).toBeVisible({ timeout: 30_000 });

  // A pair whose scan failed shows an error notice on click, not a crash.
  const errCell = page.locator('button', { hasText: 'Failed — retry' }).first();
  if (await errCell.count()) {
    await errCell.click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
    // …and switching back to a good pair recovers cleanly.
    await pricedCells.nth(0).click();
    await expect(page.getByRole('button', { name: 'Choose return' }).first())
      .toBeVisible({ timeout: 30_000 });
  }
});

test('flights: emissions column sorts, layover flags and legroom in details', async ({ page }) => {
  await signUp(page, 'E2E Emissions', uniqueEmail('emissions'));
  await createAroundDec4Trip(page, false);
  await page.getByRole('link', { name: 'Flights', exact: true }).click();
  await page.getByRole('button', { name: 'Search flights' }).click();
  await expect(outboundRows(page).first()).toBeVisible({ timeout: 60_000 });

  const table = page.getByTestId('outbound-table');
  await expect(page.getByRole('button', { name: 'Emissions', exact: true })).toBeVisible();
  await expect(table.locator('tbody td', { hasText: /\d+ kg/ }).first()).toBeVisible();
  await expect(table.getByText(/(below|above) typical|typical for this route/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Emissions', exact: true }).click();
  const mainRows = table.locator('tbody tr.cursor-pointer');
  const kgOf = async (i: number) => {
    const m = /(\d+) kg/.exec(await mainRows.nth(i).locator('td').nth(4).innerText());
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  };
  expect(await kgOf(0)).toBeLessThanOrEqual(await kgOf(1));

  const stopRow = mainRows.filter({ hasText: '1 stop' }).first();
  await stopRow.click();
  const detail = table.locator('tbody tr').filter({ hasText: 'Layover in' }).first();
  await expect(detail).toBeVisible();
  await expect(detail.getByText(/legroom/).first()).toBeVisible();
});

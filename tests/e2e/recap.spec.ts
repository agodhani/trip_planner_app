import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('recap: tab hidden until the trip has a story, then renders real values', async ({ page }) => {
  await signUp(page, 'E2E Recapper', uniqueEmail('recap'));
  await createTripWeekendsInNov2026(page);

  const nav = page.getByRole('navigation', { name: 'Trip sections' });

  // Fresh trip: status planning, no outcomes/journal/expenses → no Recap tab.
  await expect(nav.getByRole('link', { name: 'Recap', exact: true })).toHaveCount(0);

  // A manually-added itinerary item alone does not unlock it (still 'planned').
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  await page.getByPlaceholder('Title').fill('E2E Alfama walk');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('E2E Alfama walk').first()).toBeVisible({ timeout: 15_000 });
  await expect(nav.getByRole('link', { name: 'Recap', exact: true })).toHaveCount(0);

  // Mark an outcome + rating + note on the Log tab — the first recap content.
  await page.getByRole('link', { name: 'Log', exact: true }).click();
  const row = page.locator('li', { hasText: 'E2E Alfama walk' });
  await row.getByLabel('Outcome').selectOption('done');
  await row.getByLabel('Rating').selectOption({ label: '5★' });
  await row.getByLabel('Notes').fill('Best sunset of the trip');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByText('Best sunset of the trip')).toBeVisible({ timeout: 15_000 });

  // Journal entry.
  await page.getByPlaceholder('What happened today…').fill('Landed late, hotel bar closed');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByText('Landed late, hotel bar closed')).toBeVisible({ timeout: 15_000 });

  // Expense shared with a second traveler so settle-up has something to say.
  await page.getByRole('link', { name: 'People', exact: true }).click();
  await page.getByLabel('Traveler name').fill('Sam');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Sam', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Budget', exact: true }).click();
  await page.getByPlaceholder('Description').fill('Dinner Lisbon');
  await page.locator('select[name="category"]').selectOption('food');
  await page.getByPlaceholder('0.00').fill('30');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByText('Dinner Lisbon')).toBeVisible({ timeout: 15_000 });

  // Back on the Log tab the banner and the nav tab now both point at Recap.
  await page.getByRole('link', { name: 'Log', exact: true }).click();
  await expect(nav.getByRole('link', { name: 'Recap', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('log-recap-link')).toBeVisible();
  await page.getByTestId('log-recap-link').click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}\/recap$/);

  // Header: name, status chip, route, dates, travelers — all real values.
  const header = page.getByTestId('recap-header');
  await expect(header).toContainText('Planning');
  await expect(header).toContainText('New York → Lisbon');
  await expect(header).toContainText('Weekends in Nov 2026');
  await expect(header).toContainText('E2E Recapper, Sam');

  // By the numbers: outcome counts, top-rated item, spend.
  const numbers = page.getByTestId('recap-numbers');
  await expect(numbers).toContainText('100%');
  await expect(numbers).toContainText('1 of 1 item');
  await expect(numbers).toContainText('Top rated:');
  await expect(numbers).toContainText('E2E Alfama walk');
  await expect(numbers).toContainText('$30.00');
  await expect(numbers).toContainText('$15.00');

  // Day-by-day timeline: item with outcome badge, rating and notes.
  const timeline = page.getByTestId('recap-timeline');
  await expect(timeline).toContainText('E2E Alfama walk');
  await expect(timeline).toContainText('★★★★★');
  await expect(timeline).toContainText('Best sunset of the trip');
  await expect(timeline).toContainText('Done');

  // Top moments: the 5★ item and the journal entry.
  const moments = page.getByTestId('recap-moments');
  await expect(moments).toContainText('E2E Alfama walk');
  await expect(moments).toContainText('Landed late, hotel bar closed');

  // Money: category total + the real settle-up transfer.
  const money = page.getByTestId('recap-money');
  await expect(money).toContainText('Food');
  await expect(money).toContainText('$30.00');
  await expect(money).toContainText('Sam pays E2E Recapper $15.00');

  // Actions.
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy as text' })).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import { createTripExactDates, signUp, uniqueEmail } from './helpers';

/** The board column for day `n` (1-based). */
const dayCol = (page: Page, n: number) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(`Day ${n}\\b`) }) }).first();

/** Add a manual item to day `n` (Day select index: 0=Unscheduled, so index=n) and optionally set times. */
async function addItem(page: Page, title: string, dayN: number, start?: string, end?: string) {
  await page.getByPlaceholder('Title').fill(title);
  await page.getByLabel('Day', { exact: true }).selectOption({ index: dayN });
  await page.getByRole('button', { name: 'Add item' }).click();
  const cardEl = dayCol(page, dayN).locator('div.rounded-lg.border', { hasText: title }).first();
  await expect(cardEl).toBeVisible({ timeout: 15_000 });
  if (!start) return;
  await cardEl.getByLabel('Edit details').click();
  await cardEl.getByLabel('Start').fill(start);
  if (end) await cardEl.getByLabel('End').fill(end);
  await cardEl.getByRole('button', { name: 'Save' }).click();
  await expect(cardEl).toContainText(end ? `${start}–${end}` : start, { timeout: 15_000 });
}

/**
 * TP_TEST_NOW is pinned at 2026-10-30T12:00Z; the Lisbon trip Oct 29–Nov 1
 * makes "today" Day 2 at 12:00 local (Europe/Lisbon is UTC+0 by then).
 * Manual items only — zero provider calls.
 */
test('today: live tab, now/next classify, done + offline queue + revert', async ({ page, context }) => {
  await signUp(page, 'E2E Today', uniqueEmail('today'));
  await createTripExactDates(page, '2026-10-29', '2026-11-01');

  // The overview banner and first-position Today tab appear while live.
  await expect(page.getByText('Trip is live')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Trip sections' });
  await expect(nav.getByRole('link').first()).toHaveText(/Today/);

  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  await addItem(page, 'E2E Breakfast', 2, '08:00', '09:00');
  await addItem(page, 'E2E Lunch', 2, '11:00', '13:00');
  await addItem(page, 'E2E Tower visit', 2, '15:30');
  await addItem(page, 'E2E Souvenirs', 2);

  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByTestId('today-now')).toContainText('E2E Lunch', { timeout: 15_000 });
  await expect(page.getByTestId('today-earlier')).toContainText('E2E Breakfast');
  await expect(page.getByTestId('today-next')).toContainText('E2E Tower visit');
  await expect(page.getByTestId('today-anytime')).toContainText('E2E Souvenirs');
  await expect(page.getByTestId('today-gap')).toHaveText(/150 min free until 15:30/);
  await expect(page.getByTestId('today-progress')).toContainText('0 of 4');

  // One-tap Done moves the Now card into Done today and writes the log outcome.
  await page.getByTestId('today-now').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('today-done')).toContainText('E2E Lunch', { timeout: 15_000 });
  await expect(page.getByTestId('today-progress')).toContainText('1 of 4');

  await page.getByRole('link', { name: 'Log', exact: true }).click();
  await expect(
    page.locator('li', { hasText: 'E2E Lunch' }).getByLabel('Outcome'),
  ).toHaveValue('done', { timeout: 15_000 });

  // Offline: the outcome queues locally with a pending chip, then syncs.
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByTestId('today-earlier')).toContainText('E2E Breakfast', { timeout: 15_000 });
  await context.setOffline(true);
  await page
    .getByTestId('today-earlier')
    .locator('li', { hasText: 'E2E Breakfast' })
    .getByRole('button', { name: 'Done' })
    .click();
  await expect(page.getByTestId('outcome-pending')).toBeVisible();
  await expect(page.getByTestId('today-done')).toContainText('E2E Breakfast');
  await context.setOffline(false);
  await expect(page.getByTestId('outcome-pending')).toHaveCount(0, { timeout: 15_000 });

  // The synced outcome persists across reload; revert moves it back to planned.
  await page.reload();
  await expect(page.getByTestId('today-done')).toContainText('E2E Breakfast', { timeout: 15_000 });
  await page
    .getByTestId('today-done')
    .locator('li', { hasText: 'E2E Breakfast' })
    .getByRole('button', { name: 'Back to planned' })
    .click();
  await expect(page.getByTestId('today-earlier')).toContainText('E2E Breakfast', { timeout: 15_000 });
});

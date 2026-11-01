import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('transport: compute routes between items, choose leg, manual leg', async ({ page }) => {
  await signUp(page, 'E2E Rider', uniqueEmail('ride'));
  await createTripWeekendsInNov2026(page);

  // Shortlist two located places from the maps fixture.
  await page.getByRole('link', { name: 'Activities', exact: true }).click();
  await page.getByRole('button', { name: 'Museums' }).click();
  await expect(page.getByText(/of \d+ places/).first()).toBeVisible({ timeout: 30_000 });
  const shortlistBtns = page.getByRole('button', { name: 'Shortlist', exact: true });
  await shortlistBtns.first().click();
  await expect(page.getByText('Shortlisted activities')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Shortlisted', { exact: true })).toHaveCount(1);
  await shortlistBtns.first().click();
  await expect(page.getByText('Shortlisted', { exact: true })).toHaveCount(2, { timeout: 15_000 });

  // Itinerary: first one goes in Unscheduled, then onto day 1; second straight to day 1.
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  const pool = page.locator('section', { hasText: 'Shortlisted activities' });
  await expect(pool.locator('li')).toHaveCount(2, { timeout: 15_000 });
  await pool.locator('li').first().getByRole('button', { name: 'Add' }).click();
  const unscheduled = page.locator('section', { has: page.getByRole('heading', { name: 'Unscheduled' }) });
  await expect(unscheduled.getByLabel('Move to day')).toHaveCount(1, { timeout: 15_000 });
  await unscheduled.getByLabel('Move to day').selectOption({ index: 1 });
  await expect(unscheduled.getByText('Nothing unscheduled.')).toBeVisible({ timeout: 15_000 });
  await expect(pool.locator('li')).toHaveCount(1);
  await pool.locator('li').first().locator('select[name="day"]').selectOption({ index: 1 });
  await pool.locator('li').first().getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Shortlisted activities')).toHaveCount(0, { timeout: 15_000 });

  // Compute routes → walk/drive/transit legs via OSRM/FOSSGIS/Transitous fixtures.
  await page.getByRole('link', { name: 'Getting around', exact: true }).click();
  await page.getByRole('button', { name: 'Compute routes' }).click();
  await expect(page.getByRole('heading', { name: /→/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^Walk/).first()).toBeVisible();
  await expect(page.getByText(/^Drive/).first()).toBeVisible();
  await expect(page.getByText(/^Transit/).first()).toBeVisible();
  await expect(page.getByText('chosen').first()).toBeVisible(); // walk ≤ 20 min auto-chosen

  // Pick a different leg.
  await page.getByRole('button', { name: 'Use this' }).first().click();
  await expect(page.getByText('chosen')).toHaveCount(1, { timeout: 15_000 });

  // Manual leg with cost — replaces the same-mode computed option.
  await page.getByPlaceholder('e.g. Rental car').fill('Rental car');
  await page.getByPlaceholder('min').fill('30');
  await page.getByPlaceholder(/cost/).fill('45');
  await page.getByRole('button', { name: 'Add leg' }).click();
  await expect(page.getByText('Rental car · $45.00')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('via added manually')).toBeVisible();
});

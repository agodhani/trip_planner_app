import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('transport: compute routes between items, choose leg, manual leg', async ({ page }) => {
  await signUp(page, 'E2E Rider', uniqueEmail('ride'));
  await createTripWeekendsInNov2026(page);

  // Shortlist two located places (MAAT + Money Museum from the maps fixture).
  await page.getByRole('link', { name: 'Activities', exact: true }).click();
  await page.getByRole('button', { name: 'Museums' }).click();
  await expect(page.getByText(/of \d+ places/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Shortlist' }).nth(0).click();
  await expect(page.getByText('Shortlisted activities')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Shortlist' }).nth(1).click();

  // Put both on the first day via the itinerary pool.
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  const pool = page.locator('section', { hasText: 'Shortlisted activities' });
  await expect(pool.locator('li')).toHaveCount(2, { timeout: 15_000 });
  for (const _ of [0, 1]) {
    const item = pool.locator('li').first();
    await item.locator('select[name="day"]').selectOption({ index: 1 });
    await item.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(500);
  }

  // Compute routes → walk/drive/transit legs via OSRM/FOSSGIS/Transitous fixtures.
  await page.getByRole('link', { name: 'Getting around', exact: true }).click();
  await page.getByRole('button', { name: 'Compute routes' }).click();
  await expect(page.getByRole('heading', { name: /MAAT/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^walk/).first()).toBeVisible();
  await expect(page.getByText(/^drive/).first()).toBeVisible();
  await expect(page.getByText(/^transit/).first()).toBeVisible();
  await expect(page.getByText('chosen').first()).toBeVisible(); // walk ≤ 20 min auto-chosen

  // Pick a different leg.
  await page.getByRole('button', { name: 'Use this' }).first().click();
  await expect(page.getByText('chosen')).toHaveCount(1, { timeout: 15_000 });

  // Manual leg with cost — replaces the same-mode computed option.
  await page.getByPlaceholder('e.g. Rental car').fill('Rental car');
  await page.getByPlaceholder('min').fill('30');
  await page.getByPlaceholder(/cost/).fill('45');
  await page.getByRole('button', { name: 'Add leg' }).click();
  await expect(page.getByText('manual · Rental car')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('USD 45')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { pickPlace, signUp, uniqueEmail } from './helpers';

test('flights: scan, pick pair, returns, shortlist, select, vote, manual', async ({ page }) => {
  await signUp(page, 'E2E Flyer', uniqueEmail('flyer'));
  await page.goto('/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByRole('button', { name: 'Around a date' }).click();
  await page.getByLabel('Around', { exact: true }).fill('2026-12-04');
  await page.getByText('Return departs between').click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Flights', exact: true }).click();

  await page.getByRole('button', { name: 'Search flights' }).click();
  // Fixture replay is fast; wait for priced heatmap cells.
  const cell = page.locator('button', { hasText: '$' }).first();
  await expect(cell).toBeVisible({ timeout: 60_000 });
  await cell.click();
  await expect(page.getByText('Loading…')).toBeHidden({ timeout: 60_000 });
  await page.getByRole('button', { name: 'See return flights' }).first().click();
  // The 5pm-ET return window hides every fixture return — opt into seeing all.
  await expect(page.getByText('No return flights inside your time window')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('checkbox', { name: 'Show returns outside your time window' }).check();
  await expect(page.locator('text=Back LIS').first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Shortlist' }).first().click();
  await expect(page.getByText('Shortlisted flights')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Select' }).first().click();
  await expect(page.getByText('selected').first()).toBeVisible();

  await page.getByRole('button', { name: 'Vote up' }).first().click();
  await page.getByLabel('Option comment').first().fill('Looks good!');
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Looks good!')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByPlaceholder('Airline (DL)').fill('DL');
  await page.getByPlaceholder('Flight #').fill('272');
  await page.getByPlaceholder('JFK', { exact: true }).fill('JFK');
  await page.getByPlaceholder('LIS', { exact: true }).fill('LIS');
  await page.getByPlaceholder('2026-12-04T20:15').fill('2026-12-04T20:15');
  await page.getByPlaceholder('2026-12-05T08:00').fill('2026-12-05T08:00');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('manual').first()).toBeVisible({ timeout: 15_000 });
});

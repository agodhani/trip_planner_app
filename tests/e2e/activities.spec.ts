import { expect, test } from '@playwright/test';
import { pickPlace, signUp, uniqueEmail } from './helpers';

test('activities: category search, shortlist, manual entry', async ({ page }) => {
  await signUp(page, 'E2E Explorer', uniqueEmail('acts'));
  await page.goto('/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByLabel('Month').fill('2026-11');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Activities', exact: true }).click();

  await page.getByRole('button', { name: 'Museums' }).click();
  await expect(page.getByText(/of \d+ places/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Shortlist' }).first().click();
  await expect(page.getByText('Shortlisted activities')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByPlaceholder('Activity name').fill('E2E Fado night');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('manual').first()).toBeVisible({ timeout: 15_000 });
});

import { expect, test } from '@playwright/test';
import { pickPlace, signUp, uniqueEmail } from './helpers';

test('stay: search, shortlist, select, manual entry, budget planned', async ({ page }) => {
  await signUp(page, 'E2E Stayer', uniqueEmail('stay'));
  await page.goto('/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByRole('button', { name: 'Around a date' }).click();
  await page.getByLabel('Around', { exact: true }).fill('2026-12-04');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Stay', exact: true }).click();

  // Fixture-backed: SerpApi account is "ok" and the search is recorded.
  await expect(page.getByText('SerpApi searches left')).toBeVisible();
  await page.locator('input[type="date"]').first().fill('2026-12-04');
  await page.locator('input[type="date"]').nth(1).fill('2026-12-07');
  await page.getByRole('button', { name: 'Search stays' }).click();
  await expect(page.getByText(/of \d+ stays/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Top pick')).toHaveCount(3);

  // Server-side filters changed after searching → nudge to search again.
  await page.getByRole('button', { name: 'Pool' }).click();
  await expect(page.getByText('Filters changed — search again to apply them')).toBeVisible();
  await page.getByRole('button', { name: 'Pool' }).click();
  await expect(page.getByText('Filters changed')).toHaveCount(0);

  await page.getByRole('button', { name: 'Shortlist', exact: true }).first().click();
  await expect(page.getByText('Shortlisted stays')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Shortlisted', { exact: true }).first()).toBeVisible();

  // Shortlisted but not selected: Budget shows an estimate, not a committed cost.
  await page.getByRole('link', { name: 'Budget', exact: true }).click();
  await expect(page.getByText(/^est\. \$/)).toBeVisible();
  await expect(page.getByTestId('budget-planned')).toHaveText('$0.00');

  await page.getByRole('link', { name: 'Stay', exact: true }).click();
  await page.getByRole('button', { name: 'Select' }).first().click();
  await expect(page.getByText('selected').first()).toBeVisible();
  await expect(page.getByTestId('tab-done-stay')).toBeVisible();

  await page.getByRole('link', { name: 'Budget', exact: true }).click();
  await expect(page.getByTestId('budget-planned')).not.toHaveText('$0.00');
  await expect(page.getByText(/^est\. /)).toHaveCount(0);

  await page.getByRole('link', { name: 'Stay', exact: true }).click();
  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByPlaceholder('Hotel or flat name').fill('E2E Pension');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('li', { hasText: 'E2E Pension' }).getByText('manual', { exact: true }))
    .toBeVisible({ timeout: 15_000 });

  // The consolidated Shortlist tab aggregates every kind.
  await page.getByRole('link', { name: 'Shortlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stays' })).toBeVisible();
  await expect(page.getByText('E2E Pension').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Stays \(\d+\)/ })).toBeVisible();
});

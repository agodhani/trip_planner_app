import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('budget: add expenses incl. FX, balances, delete', async ({ page }) => {
  await signUp(page, 'E2E Budgeter', uniqueEmail('budget'));
  await createTripWeekendsInNov2026(page);
  await page.getByRole('link', { name: 'Budget', exact: true }).click();

  await expect(page.getByText('Planned vs actual')).toBeVisible();
  await expect(page.getByText('No expenses logged yet.')).toBeVisible();

  // Same-currency expense (no FX call).
  await page.getByPlaceholder('Description').fill('Dinner Lisbon');
  await page.locator('select[name="category"]').selectOption('food');
  await page.getByPlaceholder('0.00').fill('30');
  await page.locator('input[name="spentOn"]').fill('2026-11-07');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByText('Dinner Lisbon')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Total spent: USD 30.00')).toBeVisible();

  // EUR expense → Frankfurter fixture (1.08) → shows base conversion.
  await page.getByPlaceholder('Description').fill('Tram tickets');
  await page.locator('select[name="category"]').selectOption('transport');
  await page.getByPlaceholder('0.00').fill('20');
  await page.locator('input[name="currency"]').fill('EUR');
  await page.locator('input[name="spentOn"]').fill('2026-11-07');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByText('Tram tickets')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('(USD 21.60)')).toBeVisible();
  await expect(page.getByText('Total spent: USD 51.60')).toBeVisible();
  await expect(page.getByText('Balances')).toBeVisible();

  // Delete the EUR expense.
  await page.locator('li', { hasText: 'Tram tickets' }).getByRole('button', { name: '×' }).click();
  await expect(page.getByText('Tram tickets')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('Total spent: USD 30.00')).toBeVisible();
});

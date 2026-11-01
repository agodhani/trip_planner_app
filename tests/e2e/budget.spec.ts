import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('budget: add expenses incl. FX, split + settle-up, delete', async ({ page }) => {
  await signUp(page, 'E2E Budgeter', uniqueEmail('budget'));
  await createTripWeekendsInNov2026(page);
  // A second traveler (no account) to split costs with.
  await page.getByRole('link', { name: 'People', exact: true }).click();
  await page.getByLabel('Traveler name').fill('Sam');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Sam', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Budget', exact: true }).click();
  await expect(page.getByText('Who owes whom')).toHaveCount(0);

  await expect(page.getByText('Planned vs actual')).toBeVisible();
  await expect(page.getByText('No expenses logged yet.')).toBeVisible();
  // Sensible defaults: a date is pre-filled and the payer is me.
  await expect(page.locator('input[name="spentOn"]')).not.toHaveValue('');
  await expect(page.locator('select[name="paidByTravelerId"] option:checked')).toHaveText('E2E Budgeter');

  // Same-currency expense (no FX call).
  await page.getByPlaceholder('Description').fill('Dinner Lisbon');
  await page.locator('select[name="category"]').selectOption('food');
  await page.getByPlaceholder('0.00').fill('30');
  await page.locator('input[name="spentOn"]').fill('2026-11-07');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByText('Dinner Lisbon')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('budget-spent')).toHaveText('$30.00');
  await expect(page.getByText('Sam pays E2E Budgeter $15.00')).toBeVisible();

  // EUR expense → Frankfurter fixture (1.08) → shows base conversion.
  await page.getByPlaceholder('Description').fill('Tram tickets');
  await page.locator('select[name="category"]').selectOption('transport');
  await page.getByPlaceholder('0.00').fill('20');
  await page.locator('input[name="currency"]').fill('EUR');
  await page.locator('input[name="spentOn"]').fill('2026-11-07');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByText('Tram tickets')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('($21.60)')).toBeVisible();
  await expect(page.getByTestId('budget-spent')).toHaveText('$51.60');
  await expect(page.getByText('Who owes whom')).toBeVisible();
  await expect(page.getByText('Sam pays E2E Budgeter $25.80')).toBeVisible();

  // Delete the EUR expense.
  await page.locator('li', { hasText: 'Tram tickets' }).getByRole('button', { name: 'Delete expense' }).click();
  await expect(page.getByText('Tram tickets')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId('budget-spent')).toHaveText('$30.00');
});

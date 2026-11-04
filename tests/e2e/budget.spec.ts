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

test('budget: exact amounts, shares and equal-among-subset splits', async ({ page }) => {
  await signUp(page, 'E2E Splitter', uniqueEmail('split'));
  await createTripWeekendsInNov2026(page);
  await page.getByRole('link', { name: 'People', exact: true }).click();
  await page.getByLabel('Traveler name').fill('Sam');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Sam', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Budget', exact: true }).click();

  const addBtn = page.getByRole('button', { name: 'Add expense' });
  // Exact amounts must add up to the expense before submit is allowed.
  await page.getByRole('button', { name: 'Exact amounts' }).click();
  await page.getByPlaceholder('Description').fill('Hotel deposit');
  await page.getByPlaceholder('0.00').fill('45');
  await page.getByLabel("E2E Splitter's amount").fill('30');
  await page.getByLabel("Sam's amount").fill('10');
  await expect(page.getByText(/\$5\.00 left/)).toBeVisible();
  await expect(addBtn).toBeDisabled();
  await page.getByLabel("Sam's amount").fill('15');
  await expect(page.getByText('Adds up to $45.00')).toBeVisible();
  await addBtn.click();
  await expect(page.getByText('exact: E2E Splitter $30.00 · Sam $15.00')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Sam pays E2E Splitter $15.00')).toBeVisible();

  // Shares prorate the expense: me 2, Sam 1 of Sam's $30 → I owe Sam $20,
  // netting to me paying Sam $5.
  await page.getByRole('button', { name: 'By shares' }).click();
  await page.getByPlaceholder('Description').fill('Groceries');
  await page.getByPlaceholder('0.00').fill('30');
  await page.locator('select[name="paidByTravelerId"]').selectOption({ label: 'Sam' });
  await page.getByLabel("E2E Splitter's shares").fill('2');
  await expect(page.getByText('E2E Splitter $20.00 · Sam $10.00')).toBeVisible();
  await addBtn.click();
  await expect(page.getByText('shares: E2E Splitter 2 · Sam 1')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('E2E Splitter pays Sam $5.00')).toBeVisible();

  // Equal among a subset: Sam unchecked → only I carry the museum ticket.
  await page.getByRole('button', { name: 'Equally' }).click();
  await page.getByPlaceholder('Description').fill('Museum');
  await page.getByPlaceholder('0.00').fill('10');
  await page.locator('select[name="paidByTravelerId"]').selectOption({ label: 'E2E Splitter' });
  await page.getByRole('checkbox', { name: 'Sam' }).uncheck();
  await expect(page.getByText('$10.00 each')).toBeVisible();
  await addBtn.click();
  await expect(page.getByText('split equally: E2E Splitter')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('E2E Splitter pays Sam $5.00')).toBeVisible();
});

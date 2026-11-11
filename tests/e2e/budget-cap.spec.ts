import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

/**
 * The booked→spent bridge end to end: a cap on the Budget tab, a manual stay
 * marked booked with an actual paid amount → the expense appears, committed
 * remainder stays committed, and the lodging cap trips its over-by note.
 * Manual data only — no providers.
 */
test('budget caps: set caps, book with paid amount, over-cap flag', async ({ page }) => {
  await signUp(page, 'E2E Caper', uniqueEmail('cap'));
  await createTripWeekendsInNov2026(page);

  // Total cap $400 + a lodging cap of $250 on the Budget tab.
  await page.getByRole('link', { name: 'Budget', exact: true }).click();
  await expect(page.getByText('No budget set yet')).toBeVisible();
  await page.getByText('Set a budget').click();
  await page.getByLabel(/Total cap/).fill('400');
  await page.getByLabel('Lodging', { exact: true }).fill('250');
  await page.getByRole('button', { name: 'Save budget' }).click();
  await expect(page.getByTestId('cap-left')).toHaveText('$400.00 left', { timeout: 15_000 });
  await expect(page.getByTestId('per-person-line')).toContainText('cap $400.00 · spent $0.00');

  // A manual stay priced at $300, selected then booked for an actual $280.
  await page.getByRole('link', { name: 'Stay', exact: true }).click();
  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByPlaceholder('Hotel or flat name').fill('E2E Cap Inn');
  await page.getByLabel(/Total price/).fill('300');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const card = page.locator('li', { hasText: 'E2E Cap Inn' });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button', { name: 'Select' }).click();
  await expect(card.getByText('selected').first()).toBeVisible({ timeout: 15_000 });

  // Mark booked: paid $280, "Log as expense" stays ticked (defaults on — a price exists).
  await card.locator('summary', { hasText: 'Mark booked' }).click();
  await card.getByLabel('Paid amount').fill('280');
  await expect(card.getByLabel('Log as expense')).toBeChecked();
  await card.getByRole('button', { name: 'Mark booked' }).click();
  await expect(card.getByText('booked').first()).toBeVisible({ timeout: 15_000 });

  // The paid $280 is now spent; the $20 remainder stays committed.
  await page.getByRole('link', { name: 'Budget', exact: true }).click();
  await expect(page.getByText('E2E Cap Inn')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/paid by E2E Caper/)).toBeVisible();
  await expect(page.getByTestId('budget-spent')).toHaveText('$280.00');
  // $400 − ($280 spent + $20 committed).
  await expect(page.getByTestId('cap-left')).toHaveText('$100.00 left');
  // Lodging cap $250 vs $300 committed+spent → over by $50.
  await expect(page.getByTestId('cat-over-lodging')).toHaveText('over by $50.00');
  await expect(page.getByTestId('per-person-line')).toContainText('cap $400.00 · spent $280.00 · committed $20.00');
});

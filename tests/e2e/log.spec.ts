import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('log: outcomes + rating on items, journal entry, trip status', async ({ page }) => {
  await signUp(page, 'E2E Logger', uniqueEmail('log'));
  await createTripWeekendsInNov2026(page);

  // Create one itinerary item so the log has something to mark.
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  await page.getByPlaceholder('Title').fill('E2E Alfama walk');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('E2E Alfama walk').first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: 'Log', exact: true }).click();
  const row = page.locator('li', { hasText: 'E2E Alfama walk' });
  await expect(row).toBeVisible();
  await row.locator('select[name="outcome"]').selectOption('done');
  await row.locator('select[name="rating"]').selectOption({ label: '5★' });
  await row.locator('input[name="notes"]').fill('Great views');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByText('★★★★★')).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('Great views')).toBeVisible();

  await page.getByPlaceholder('What happened today…').fill('Landed late, hotel bar closed');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByText('Landed late, hotel bar closed')).toBeVisible({ timeout: 15_000 });

  await page.locator('select[name="status"]').selectOption('completed');
  await page.getByRole('button', { name: 'Update' }).click();
  await expect(page.locator('p', { hasText: 'Trip status:' })).toContainText('completed', { timeout: 15_000 });
});

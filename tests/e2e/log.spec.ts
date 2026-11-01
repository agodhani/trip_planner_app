import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('log: auto-saved outcomes + rating, notes, journal entry, trip status', async ({ page }) => {
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

  // Picking a rating saves immediately — no Save click.
  await row.getByLabel('Rating').selectOption({ label: '5★' });
  await expect(row.getByText('★★★★★')).toBeVisible({ timeout: 15_000 });
  await row.getByLabel('Outcome').selectOption('done');
  await expect(row.getByRole('status')).toHaveText('Saved', { timeout: 15_000 });
  await page.reload();
  await expect(row.getByLabel('Outcome')).toHaveValue('done', { timeout: 15_000 });

  // Free-text notes still use Save.
  await row.getByLabel('Notes').fill('Great views');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByText('Great views')).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('★★★★★')).toBeVisible();

  await page.getByPlaceholder('What happened today…').fill('Landed late, hotel bar closed');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByText('Landed late, hotel bar closed')).toBeVisible({ timeout: 15_000 });

  // One click sets the status; the header chip follows.
  await page.getByRole('button', { name: 'Completed' }).click();
  await expect(page.getByRole('button', { name: 'Completed' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await expect(page.locator('h1 + span')).toHaveText('Completed');
});

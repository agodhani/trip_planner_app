import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('itinerary: custom item to pool, move to a day, manual leg section', async ({ page }) => {
  await signUp(page, 'E2E Planner', uniqueEmail('plan'));
  await createTripWeekendsInNov2026(page);
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();

  await expect(page.getByText(/days · 2026-11/).first()).toBeVisible();
  await page.getByPlaceholder('Title').fill('E2E Alfama walk');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('E2E Alfama walk').first()).toBeVisible({ timeout: 15_000 });

  // Move the pool item onto the first day via its day select.
  await page.getByLabel('Move to day').first().selectOption({ index: 1 });
  await expect(page.locator('section').filter({ hasText: 'E2E Alfama walk' }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: 'Getting around', exact: true }).click();
  await expect(page.getByText('No legs yet')).toBeVisible();
});

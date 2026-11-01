import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('itinerary: custom items, move to a day, edit details, manual leg without coordinates', async ({ page }) => {
  await signUp(page, 'E2E Planner', uniqueEmail('plan'));
  await createTripWeekendsInNov2026(page);
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();

  await expect(page.getByText(/^\d+ days · /).first()).toBeVisible();
  await expect(page.getByText('Day 1', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Title').fill('E2E Alfama walk');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('E2E Alfama walk').first()).toBeVisible({ timeout: 15_000 });

  // Move the unscheduled item onto the first day via its day select.
  await page.getByLabel('Move to day').first().selectOption({ index: 1 });
  const day1 = page.locator('section', { hasText: 'Day 1' }).first();
  await expect(day1.getByText('E2E Alfama walk')).toBeVisible({ timeout: 15_000 });

  // Edit details are tucked behind the pencil; empty cost stays empty (no stray 0).
  await day1.getByRole('button', { name: 'Edit details' }).click();
  await day1.getByLabel('Start').fill('09:30');
  await day1.getByRole('button', { name: 'Save' }).click();
  await expect(day1.getByText('09:30')).toBeVisible({ timeout: 15_000 });
  await expect(day1.getByText(/USD 0/)).toHaveCount(0);

  // A second item straight onto day 1 from the add form.
  await page.getByPlaceholder('Title').fill('E2E Dinner');
  await page.getByLabel('Day', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(day1.getByText('E2E Dinner')).toBeVisible({ timeout: 15_000 });

  // Neither item has coordinates, but a manual leg between them is still possible.
  await page.getByRole('link', { name: 'Getting around', exact: true }).click();
  await expect(page.getByText('No legs yet')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Between' })).toContainText('E2E Alfama walk → E2E Dinner');
  await page.getByPlaceholder('e.g. Rental car').fill('Taxi');
  await page.getByRole('button', { name: 'Add leg' }).click();
  await expect(page.getByText('via added manually')).toBeVisible({ timeout: 15_000 });
});

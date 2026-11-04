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

test('itinerary: opening hours — closed-day note, warning, and moving off the day', async ({ page }) => {
  await signUp(page, 'E2E Hours', uniqueEmail('hours'));
  await createTripWeekendsInNov2026(page);
  // The trip spans Thu Nov 5 – Mon Nov 9 2026 (Day 4 = Sunday); Carmo is closed Sundays.
  await page.getByRole('link', { name: 'Activities', exact: true }).click();
  await page.getByRole('button', { name: 'Museums' }).click();
  await expect(page.getByText(/of \d+ places/).first()).toBeVisible({ timeout: 30_000 });
  const carmoRow = page.locator('tr', { hasText: 'Carmo Archaeological Museum' }).first();
  await carmoRow.click();
  await expect(page.getByText(/Hours: /).first()).toBeVisible();
  await carmoRow.getByRole('button', { name: 'Shortlist', exact: true }).click();
  await expect(page.getByText('Shortlisted activities')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  const poolCard = page.locator('li', { hasText: 'Carmo Archaeological Museum' }).first();
  await expect(poolCard.getByText('Closed Sun')).toBeVisible({ timeout: 15_000 });
  const daySel = poolCard.getByLabel('Day for Carmo Archaeological Museum');
  await expect(daySel.locator('option', { hasText: 'closed' })).toHaveCount(1);

  await daySel.selectOption('2026-11-08');
  await poolCard.getByRole('button', { name: 'Add' }).click();
  const day4 = page.locator('section').filter({ has: page.getByRole('heading', { name: /Day 4/ }) }).first();
  await expect(day4.getByText('Carmo Archaeological Museum')).toBeVisible({ timeout: 15_000 });
  await expect(day4.getByText('Closed on Sundays (Google Maps hours)')).toBeVisible();

  // Move it to Friday (open) — the warning clears.
  await day4.getByLabel('Move to day').first().selectOption('2026-11-06');
  const day2 = page.locator('section').filter({ has: page.getByRole('heading', { name: /Day 2/ }) }).first();
  await expect(day2.getByText('Carmo Archaeological Museum')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Closed on Sundays')).toHaveCount(0);
});

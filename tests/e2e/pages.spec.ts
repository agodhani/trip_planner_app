import { expect, test } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

test('settings: providers status + save profile', async ({ page }) => {
  await signUp(page, 'E2E Setter', uniqueEmail('settings'));
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Data providers')).toBeVisible();
  // SerpApi account check replays the recorded fixture.
  await expect(page.getByText(/searches left/)).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Name').fill('Renamed Setter');
  await page.getByLabel('Default currency').fill('EUR');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved.')).toBeVisible({ timeout: 15_000 });
});

test('every trip tab renders; travelers add + rename', async ({ page }) => {
  await signUp(page, 'E2E Walker', uniqueEmail('walker'));

  // Trips list page.
  await expect(page.getByRole('heading', { name: 'Your trips' })).toBeVisible();

  await createTripWeekendsInNov2026(page);
  await expect(page.getByRole('heading', { name: 'Trip to Lisbon' })).toBeVisible();

  const tabs: [string, string | RegExp][] = [
    ['Flights', 'Search flights'],
    ['Stay', 'Search stays'],
    ['Activities', 'Museums'],
    ['Itinerary', /^\d+ days · /],
    ['Shortlist', 'Nothing shortlisted yet'],
    ['Getting around', 'Compute routes'],
    ['Budget', 'Planned vs actual'],
    ['Log', 'What actually happened'],
    ['People', 'Invite links'],
  ];
  for (const [tab, marker] of tabs) {
    await page.getByRole('link', { name: tab, exact: true }).click();
    await expect(page.getByText(marker).first()).toBeVisible({ timeout: 15_000 });
  }

  // People: add a non-account traveler, rename them.
  await page.getByLabel('Traveler name').fill('Grandma Jo');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Grandma Jo')).toBeVisible({ timeout: 15_000 });
  await page.locator('li', { hasText: 'Grandma Jo' }).getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('New name').fill('Grandma J');
  await page.getByLabel('New name').press('Enter');
  await expect(page.getByText('Grandma J')).toBeVisible({ timeout: 15_000 });

  // New traveler shows up in the budget payer select.
  await page.getByRole('link', { name: 'Budget', exact: true }).click();
  await expect(page.locator('select[name="paidByTravelerId"] option', { hasText: 'Grandma J' })).toHaveCount(1);
});

import { expect, test, type Page } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

/** The board column for day `n` (1-based). */
const dayCol = (page: Page, n: number) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(`Day ${n}\\b`) }) }).first();
const poolCol = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Unscheduled', exact: true }) }).first();

/** Shortlist the first two places from the Museums fixture category. */
async function shortlistTwo(page: Page) {
  await page.getByRole('link', { name: 'Activities', exact: true }).click();
  await page.getByRole('button', { name: 'Museums' }).click();
  await expect(page.getByText(/of \d+ places/).first()).toBeVisible({ timeout: 30_000 });
  const shortlistBtns = page.getByRole('button', { name: 'Shortlist', exact: true });
  await shortlistBtns.first().click();
  await expect(page.getByText('Shortlisted', { exact: true })).toHaveCount(1, { timeout: 15_000 });
  await shortlistBtns.first().click();
  await expect(page.getByText('Shortlisted', { exact: true })).toHaveCount(2, { timeout: 15_000 });
}

test('day board: located items auto-sync a real leg chip, tight-timing warning, and day map', async ({ page }) => {
  await signUp(page, 'E2E Legs', uniqueEmail('legs'));
  await createTripWeekendsInNov2026(page);
  await shortlistTwo(page);

  // Both shortlisted places go straight onto Day 1 — they carry coordinates
  // from the provider, so the board's leg sync should fill the hop.
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  const poolCards = poolCol(page).locator('li', { has: page.getByRole('button', { name: 'Add' }) });
  await expect(poolCards).toHaveCount(2, { timeout: 15_000 });
  await poolCards.first().locator('select[name="day"]').selectOption({ index: 1 });
  await poolCards.first().getByRole('button', { name: 'Add' }).click();
  await expect(poolCards).toHaveCount(1, { timeout: 15_000 });
  await poolCards.first().locator('select[name="day"]').selectOption({ index: 1 });
  await poolCards.first().getByRole('button', { name: 'Add' }).click();
  await expect(poolCards).toHaveCount(0, { timeout: 15_000 });

  // Auto leg sync (fixture replay): the walk route wins by default.
  const day1 = dayCol(page, 1);
  await expect(day1.getByText(/walk · 12 min/).first()).toBeVisible({ timeout: 20_000 });
  await expect(day1.getByRole('link', { name: 'directions' })).toBeVisible();

  // Tight timing: 10:00 → 10:05 leaves 5 min for a 12 min walk.
  const firstCard = day1.locator('div.rounded-lg.border').first();
  await firstCard.getByRole('button', { name: 'Edit details' }).click();
  await firstCard.getByLabel('Start', { exact: true }).fill('10:00');
  await firstCard.getByRole('button', { name: 'Save' }).click();
  const secondCard = day1.locator('div.rounded-lg.border').nth(1);
  await secondCard.getByRole('button', { name: 'Edit details' }).click();
  await secondCard.getByLabel('Start', { exact: true }).fill('10:05');
  await secondCard.getByRole('button', { name: 'Save' }).click();
  await expect(day1.getByText('Tight connection — needs ~12 min, 5 available')).toBeVisible({ timeout: 15_000 });

  // The day map toggles open with numbered markers and a connecting polyline.
  await day1.getByRole('button', { name: 'Toggle map for Day 1' }).click();
  await expect(day1.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
  await expect(day1.locator('.day-map-marker')).toHaveCount(2);
  await expect(day1.locator('path.leaflet-interactive')).toHaveCount(1);
  await day1.getByRole('button', { name: 'Toggle map for Day 1' }).click();
  await expect(day1.locator('.leaflet-container')).toHaveCount(0);
});

test('day board: items without coordinates stay silent; manual leg still fills the hop', async ({ page }) => {
  await signUp(page, 'E2E Manual', uniqueEmail('manual'));
  await createTripWeekendsInNov2026(page);
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();

  // Two manual items (no coordinates) onto Day 1.
  await page.getByPlaceholder('Title').fill('E2E Walk A');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(poolCol(page).getByText('E2E Walk A')).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder('Title').fill('E2E Walk B');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(poolCol(page).getByText('E2E Walk B')).toBeVisible({ timeout: 15_000 });
  await poolCol(page).locator('div.rounded-lg.border', { hasText: 'E2E Walk A' })
    .getByLabel('Move to day').selectOption({ index: 1 });
  const day1 = dayCol(page, 1);
  await expect(day1.getByText('E2E Walk A')).toBeVisible({ timeout: 15_000 });
  await poolCol(page).locator('div.rounded-lg.border', { hasText: 'E2E Walk B' })
    .getByLabel('Move to day').selectOption({ index: 1 });
  await expect(day1.getByText('E2E Walk B')).toBeVisible({ timeout: 15_000 });

  // Never had locations — no chip at all, not even "route unknown".
  await expect(day1.getByText('route unknown')).toHaveCount(0);
  await expect(day1.getByLabel('Toggle map for Day 1')).toHaveCount(0);

  // The manual-leg path still works offline and shows up back on the board.
  await page.getByRole('link', { name: 'Getting around', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Between' })).toContainText('E2E Walk A → E2E Walk B');
  await page.getByPlaceholder('e.g. Rental car').fill('Taxi');
  await page.getByPlaceholder('min').fill('25');
  await page.getByRole('button', { name: 'Add leg' }).click();
  await expect(page.getByText('via added manually')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  await expect(dayCol(page, 1).getByText(/drive · 25 min · Taxi/)).toBeVisible({ timeout: 15_000 });
});

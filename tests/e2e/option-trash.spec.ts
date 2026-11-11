import { expect, test, type Page } from '@playwright/test';
import { createTripExactDates, signUp, uniqueEmail } from './helpers';

/** Manual add on the Activities tab — no provider calls needed. */
async function addManualActivity(page: Page, name: string) {
  await page.getByRole('link', { name: 'Activities', exact: true }).click();
  // 'Add manually' toggles — a second call would close the open form.
  if (!(await page.getByPlaceholder('Activity name').isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Add manually' }).click();
  }
  await page.getByPlaceholder('Activity name').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const card = page.locator('section li', { hasText: name });
  await expect(card.getByText('manual', { exact: true })).toBeVisible({ timeout: 15_000 });
  return card;
}

async function openBin(page: Page) {
  const bin = page.getByTestId('removed-options');
  await expect(bin).toBeVisible({ timeout: 15_000 });
  await bin.locator('summary').click();
  return bin;
}

test('option bin: remove, Undo, restore, delete forever, itinerary marker', async ({ page }) => {
  await signUp(page, 'E2E Bin', uniqueEmail('bin'));
  await createTripExactDates(page, '2026-11-05', '2026-11-09');

  const card = await addManualActivity(page, 'E2E Fado night');

  // Vote + comment survive the bin — they ride the optionId, which removal keeps.
  await card.getByRole('button', { name: 'Vote up' }).click();
  await expect(card.getByText(/Votes:/)).toBeVisible({ timeout: 15_000 });
  await card.getByPlaceholder('Add a comment for the group…').fill('E2E keep me');
  await card.getByRole('button', { name: 'Post' }).click();
  await expect(card.getByText('E2E keep me')).toBeVisible({ timeout: 15_000 });

  // Remove → toast with Undo → the card is gone until Undo.
  await card.getByRole('button', { name: 'Remove' }).click();
  await expect(card).toHaveCount(0, { timeout: 15_000 });
  const toast = page.getByRole('status').filter({ hasText: 'Removed E2E Fado night' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  const restored = page.locator('li', { hasText: 'E2E Fado night' });
  await expect(restored).toBeVisible({ timeout: 15_000 });
  await expect(restored.getByText(/Votes:/)).toBeVisible();
  await expect(restored.getByText('E2E keep me')).toBeVisible();
});

test('option bin: bin row, Restore, and Delete forever with confirm step', async ({ page }) => {
  await signUp(page, 'E2E Bin Two', uniqueEmail('bin2'));
  await createTripExactDates(page, '2026-11-05', '2026-11-09');
  const card = await addManualActivity(page, 'E2E Alfama walk');

  await card.getByRole('button', { name: 'Remove' }).click();
  await expect(card).toHaveCount(0, { timeout: 15_000 });

  // Bin row on the Shortlist tab: who/when, then Restore puts it back.
  await page.getByRole('link', { name: 'Shortlist', exact: true }).click();
  const bin = await openBin(page);
  const row = bin.locator('li', { hasText: 'E2E Alfama walk' });
  await expect(row.getByText(/Removed by E2E Bin Two/)).toBeVisible();
  await row.getByRole('button', { name: 'Restore' }).click();
  // Option cards render in <section> groups; bin rows live in <details>.
  await expect(page.locator('section li', { hasText: 'E2E Alfama walk' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('removed-options')).toHaveCount(0);

  // Remove again → delete forever needs the second click.
  const card2 = page.locator('section li', { hasText: 'E2E Alfama walk' });
  await card2.getByRole('button', { name: 'Remove' }).click();
  await expect(card2).toHaveCount(0, { timeout: 15_000 });
  const bin2 = await openBin(page);
  const row2 = bin2.locator('li', { hasText: 'E2E Alfama walk' });
  const purge = row2.getByRole('button', { name: 'Delete forever' });
  await purge.click();
  // Armed, not yet executed — the row is still there.
  await expect(row2.getByRole('button', { name: 'Confirm delete forever' })).toBeVisible();
  await expect(row2).toBeVisible();
  await row2.getByRole('button', { name: 'Confirm delete forever' }).click();
  await expect(row2).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('removed-options')).toHaveCount(0);
  await expect(page.locator('section li', { hasText: 'E2E Alfama walk' })).toHaveCount(0);
});

test('option bin: binned option leaves shortlist, counts and itinerary link gets a marker', async ({ page }) => {
  await signUp(page, 'E2E Bin Three', uniqueEmail('bin3'));
  await createTripExactDates(page, '2026-11-05', '2026-11-09');
  await addManualActivity(page, 'E2E Miradouro');
  await addManualActivity(page, 'E2E Tram ride');

  // Put one on the itinerary (unscheduled) so the item links the option.
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  const poolForm = page.locator('li', { hasText: 'E2E Miradouro' }).locator('form');
  await poolForm.getByRole('button', { name: 'Add' }).click();
  const pool = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Unscheduled' }) });
  await expect(pool.locator('p', { hasText: 'E2E Miradouro' }).first()).toBeVisible({ timeout: 15_000 });

  // Shortlist counts both; removing one drops it.
  await page.getByRole('link', { name: 'Shortlist', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All (2)' })).toBeVisible({ timeout: 15_000 });
  await page.locator('section li', { hasText: 'E2E Miradouro' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'All (1)' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('section li', { hasText: 'E2E Miradouro' })).toHaveCount(0);

  // The itinerary item keeps its snapshot title, flagged as removed.
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  const item = pool.locator('p').filter({ hasText: 'E2E Miradouro' }).first();
  await expect(item).toBeVisible({ timeout: 15_000 });
  await expect(item.getByText('removed', { exact: true })).toBeVisible();
});

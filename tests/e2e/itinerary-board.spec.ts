import { expect, test, type Locator, type Page } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

/** The board column for day `n` (1-based). */
const dayCol = (page: Page, n: number) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(`Day ${n}\\b`) }) }).first();
const poolCol = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Unscheduled', exact: true }) }).first();

/** The horizontally scrolling board strip. */
const board = (page: Page) => page.locator('div.flex.items-start.gap-3.overflow-x-auto').first();

/**
 * Pointer-based drag used by @dnd-kit: down on the card handle, activate,
 * edge-hover so the board auto-scrolls until the target column is visible,
 * then drop on it.
 */
async function dragTo(page: Page, title: string, target: Locator) {
  // Bring the target column into the strip's viewport first — horizontal
  // visibility is per-column, so a same-column target becomes visible with
  // its card; a cross-column target still needs the edge-hover loop below.
  await target.scrollIntoViewIfNeeded();
  const handle = page.getByLabel(`Drag ${title} to another day or position`);
  await handle.scrollIntoViewIfNeeded();
  await expect(handle).toBeVisible();
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 12, h.y + h.height / 2, { steps: 3 });
  const bb = (await board(page).boundingBox())!;
  let t = await target.boundingBox();
  for (let i = 0; i < 80; i++) {
    if (t && t.x >= bb.x && t.x + t.width <= bb.x + bb.width) break;
    const center = t ? t.x + t.width / 2 : 0;
    const edgeX = center < bb.x ? bb.x + 24 : bb.x + bb.width - 24;
    await page.mouse.move(edgeX, bb.y + bb.height / 2, { steps: 3 });
    await page.waitForTimeout(120);
    t = await target.boundingBox();
  }
  // Fail loudly rather than dropping at a clamped edge position — an
  // off-viewport drop point lands on the wrong column (off-by-one day).
  if (!t || t.x < bb.x || t.x + t.width > bb.x + bb.width) {
    throw new Error(`drag target never became fully visible in the board strip`);
  }
  await page.mouse.move(t.x + t.width / 2, t.y + Math.min(40, t.height / 2), { steps: 8 });
  await page.mouse.up();
}

async function addItem(page: Page, title: string, dayIndex?: number) {
  await page.getByPlaceholder('Title').fill(title);
  if (dayIndex !== undefined) {
    await page.getByLabel('Day', { exact: true }).selectOption({ index: dayIndex });
  }
  await page.getByRole('button', { name: 'Add item' }).click();
}

test('itinerary board: drag between days, anchors fixed, undo restores, order persists on reload', async ({ page }) => {
  await signUp(page, 'E2E Board', uniqueEmail('board'));
  await createTripWeekendsInNov2026(page); // Days = Thu Nov 5 – Mon Nov 9 2026

  // A manually entered round trip so the board gets flight anchors.
  await page.getByRole('link', { name: 'Flights', exact: true }).click();
  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByLabel('Airline code').fill('DL');
  await page.getByLabel('Flight number').fill('100');
  await page.getByLabel('From airport').fill('JFK');
  await page.getByLabel('To airport').fill('LIS');
  await page.getByLabel('Departs', { exact: true }).fill('2026-11-05T17:00');
  await page.getByLabel('Arrives', { exact: true }).fill('2026-11-06T07:35');
  await page.getByLabel('Return departs (optional)').fill('2026-11-09T11:00');
  await page.getByLabel('Return arrives (optional)').fill('2026-11-09T15:00');
  await page.getByRole('button', { name: 'Add flight' }).click();
  const flightCard = page.locator('li', { hasText: 'DL 100' }).first();
  await expect(flightCard).toBeVisible({ timeout: 15_000 });
  await flightCard.getByRole('button', { name: 'Select', exact: true }).click();

  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  // Anchors are synced on mount: Depart Day 1, Land Day 2, Depart+Land Day 5.
  await expect(dayCol(page, 1).getByText('Depart JFK → LIS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(dayCol(page, 2).getByText('Land in LIS', { exact: false })).toBeVisible();
  await expect(dayCol(page, 5).getByText('Depart LIS → JFK', { exact: false })).toBeVisible();

  // Anchor cards are fixed points — no drag handle, no move-to-day select.
  await expect(dayCol(page, 1).getByLabel(/^Drag /)).toHaveCount(0);
  await expect(dayCol(page, 1).getByLabel('Move to day')).toHaveCount(0);

  // Two unscheduled items (wait for each: the form re-renders after a submit
  // and a queued fill can land in the detached input), then drag one onto Day 2.
  await addItem(page, 'E2E Museum');
  await expect(poolCol(page).getByText('E2E Museum')).toBeVisible({ timeout: 15_000 });
  await addItem(page, 'E2E Beach');
  await expect(poolCol(page).getByText('E2E Beach')).toBeVisible({ timeout: 15_000 });
  await dragTo(page, 'E2E Museum', dayCol(page, 2));
  await expect(dayCol(page, 2).getByText('E2E Museum')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Item moved to Day 2')).toBeVisible();

  // Undo returns it to the Unscheduled column.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(poolCol(page).getByText('E2E Museum')).toBeVisible({ timeout: 15_000 });

  // The select fallback still moves cards (keyboard/mobile path).
  await poolCol(page).getByLabel('Move to day').first().selectOption({ index: 1 });
  await expect(dayCol(page, 1).getByText('E2E Museum')).toBeVisible({ timeout: 15_000 });

  // Reorder within a day by dragging Dinner above Beach.
  await poolCol(page).getByLabel('Move to day').first().selectOption({ index: 3 });
  await expect(dayCol(page, 3).getByText('E2E Beach')).toBeVisible({ timeout: 15_000 });
  await addItem(page, 'E2E Dinner', 3);
  await expect(dayCol(page, 3).getByText('E2E Dinner')).toBeVisible({ timeout: 15_000 });
  const beachCard = dayCol(page, 3).locator('div.rounded-lg.border', { hasText: 'E2E Beach' });
  await dragTo(page, 'E2E Dinner', beachCard);
  // The toast only fires after placeItem commits — wait for it before
  // asserting order or reloading (otherwise the reload can read pre-drag state).
  await expect(page.getByText('Item moved to Day 3')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => {
    const texts = await dayCol(page, 3).allTextContents();
    const joined = texts.join(' ');
    return joined.indexOf('E2E Dinner') >= 0 && joined.indexOf('E2E Dinner') < joined.indexOf('E2E Beach');
  }).toBe(true);

  // The anchor stayed put and the column order survives a reload.
  await page.reload();
  await expect(dayCol(page, 1).getByText('Depart JFK → LIS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(dayCol(page, 1).getByText('E2E Museum')).toBeVisible();
  const day3 = (await dayCol(page, 3).allTextContents()).join(' ');
  expect(day3.indexOf('E2E Dinner')).toBeLessThan(day3.indexOf('E2E Beach'));

  // Delete routes through the toast; Undo re-adds the item back on its day.
  const dinnerCard = dayCol(page, 3).locator('div.rounded-lg.border', { hasText: 'E2E Dinner' });
  await dinnerCard.getByLabel('Delete item').click();
  await expect(page.getByText('Item deleted')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(dayCol(page, 3).getByText('E2E Dinner')).toBeVisible({ timeout: 15_000 });
});

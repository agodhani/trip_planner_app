import { expect, test, type Page } from '@playwright/test';
import { createTripWeekendsInNov2026, signUp, uniqueEmail } from './helpers';

/**
 * Fully offline: both flights come from the manual-entry form (no provider
 * calls), so this spec needs no recorded fixtures.
 */
async function addManualFlight(page: Page, f: {
  code: string; num: string; dep: string; arr: string;
  retDep?: string; retArr?: string; price?: string;
}) {
  if (!(await page.getByLabel('Airline code').isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Add manually' }).click();
  }
  await page.getByLabel('Airline code').fill(f.code);
  await page.getByLabel('Flight number').fill(f.num);
  await page.getByLabel('From airport').fill('JFK');
  await page.getByLabel('To airport').fill('LIS');
  await page.getByLabel('Departs', { exact: true }).fill(f.dep);
  await page.getByLabel('Arrives', { exact: true }).fill(f.arr);
  // The two return fields pair up — the previous entry's values must go.
  const retDep = page.getByLabel('Return departs (optional)');
  const retArr = page.getByLabel('Return arrives (optional)');
  await retDep.fill(f.retDep ?? '');
  await retArr.fill(f.retArr ?? '');
  if (f.price !== undefined) {
    await page.getByLabel('Total price').fill(f.price);
  }
  await page.getByRole('button', { name: 'Add flight' }).click();
}

test('compare: two manual flights side by side, best marked, select in sheet', async ({ page }) => {
  await signUp(page, 'E2E Compare', uniqueEmail('compare'));
  await createTripWeekendsInNov2026(page);
  await page.getByRole('link', { name: 'Flights', exact: true }).click();

  // A: round trip, cheaper, slower outbound (705 min), 0 stops both ways.
  await addManualFlight(page, {
    code: 'DL', num: '100',
    dep: '2026-12-04T20:15', arr: '2026-12-05T08:00',
    retDep: '2026-12-07T18:30', retArr: '2026-12-08T06:45',
    price: '400',
  });
  await expect(page.getByText(/^DL 100 · JFK→LIS/)).toBeVisible({ timeout: 15_000 });

  // B: one-way, pricier, faster outbound (510 min).
  await addManualFlight(page, {
    code: 'TP', num: '200',
    dep: '2026-12-04T07:00', arr: '2026-12-04T15:30',
    price: '600',
  });
  await expect(page.getByText(/^TP 200 · JFK→LIS/)).toBeVisible({ timeout: 15_000 });

  // Tick Compare on both cards — the sticky bar appears.
  const dlCard = page.locator('li').filter({ hasText: 'DL 100' });
  const tpCard = page.locator('li').filter({ hasText: 'TP 200' });
  await dlCard.getByRole('checkbox', { name: 'Compare' }).check();
  await tpCard.getByRole('checkbox', { name: 'Compare' }).check();
  await page.getByRole('button', { name: 'Compare 2 flights' }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Total price')).toBeVisible();
  await expect(sheet.getByText('Outbound')).toBeVisible();
  await expect(sheet.getByText('Emissions')).toBeVisible();

  // Real attributes from the saved payload — nothing fabricated.
  await expect(sheet.locator('td', { hasText: '$400' })).toBeVisible();
  await expect(sheet.locator('td', { hasText: '$600' })).toBeVisible();
  await expect(sheet.locator('td', { hasText: '11h 45m' })).toBeVisible();
  // Manual entries have no per-person or emissions data — honest dashes.
  await expect(sheet.locator('tr', { hasText: 'Per person' })
    .locator('td', { hasText: '—' }).first()).toBeVisible();
  await expect(sheet.locator('tr', { hasText: 'Return' })
    .locator('td', { hasText: '—' }).first()).toBeVisible();

  // The cheaper total and the faster outbound are marked best.
  await expect(sheet.locator('td[data-best="true"]', { hasText: '$400' })).toBeVisible();
  await expect(sheet.locator('td[data-best="true"]', { hasText: '8h 30m' })).toBeVisible();
  expect(await sheet.locator('td[data-best="true"]', { hasText: '$600' }).count()).toBe(0);

  // Decision controls work inside the sheet: column order follows tick order
  // (DL 100 first). Selecting there lands on the card behind the sheet.
  await expect(sheet.getByRole('button', { name: 'Vote up' })).toHaveCount(2);
  await sheet.getByRole('button', { name: 'Select', exact: true }).first().click();
  await expect(dlCard.getByText('selected', { exact: true })).toBeVisible({ timeout: 15_000 });
});

import { expect, test } from '@playwright/test';
import { pickPlace } from '../../tests/e2e/helpers';
test('live scan', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('http://localhost:3030/signup');
  await page.getByLabel('Email').fill(`live${Date.now()}@example.com`);
  await page.getByLabel('Name').fill('Live Tester');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.waitForURL(/localhost:3030\/(?!signup)/);
  await page.goto('http://localhost:3030/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByRole('button', { name: 'Around a date' }).click();
  await page.getByLabel('Around', { exact: true }).fill('2026-12-04');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Flights', exact: true }).click();
  const t1 = Date.now();
  await page.getByRole('button', { name: 'Search flights' }).click();

  await expect(page.locator('button', { hasText: /^\d\d-\d\d/ }).first()).toBeVisible({ timeout: 240_000 });
  await page.waitForFunction(() => !document.body.innerText.includes('dates checked'), null, { timeout: 300_000 });
  const cells = await page.locator('section button').allInnerTexts();
  const priced = cells.filter((c) => c.includes('$'));
  console.log(`SCAN_DONE secs=${Math.round((Date.now()-t1)/1000)} total=${Math.round((Date.now()-t0)/1000)} priced=${priced.length}/${cells.filter(c=>/^\d\d-\d\d/.test(c)).length}`);
  console.log(priced.join(' || '));
});

import { expect, test } from '@playwright/test';
import {
  createTripWeekendsInNov2026,
  PASSWORD,
  signUp,
  uniqueEmail,
} from './helpers';

test('signup → create a trip → lands on Overview with strategy summary', async ({
  page,
}) => {
  await signUp(page, 'E2E Owner', uniqueEmail('create'));
  await createTripWeekendsInNov2026(page);
  await expect(page.getByRole('heading', { name: 'Trip to Lisbon' })).toBeVisible();
  await expect(page.getByText(/Weekends in Nov 2026/).first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Planning checklist' }),
  ).toBeVisible();
});

test('logout then login returns to trips', async ({ page }) => {
  const email = uniqueEmail('logout');
  await signUp(page, 'E2E Logger', email);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Log in' }).first().click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/trips$/);
  await expect(page.getByRole('heading', { name: 'Your trips' })).toBeVisible();
});

test('a non-member opening a trip URL gets 404', async ({ page, browser }) => {
  await signUp(page, 'E2E Private', uniqueEmail('private'));
  await createTripWeekendsInNov2026(page);
  const tripUrl = page.url();

  const ctx = await browser.newContext();
  const stranger = await ctx.newPage();
  await signUp(stranger, 'E2E Stranger', uniqueEmail('stranger'));
  const res = await stranger.goto(tripUrl);
  expect(res?.status()).toBe(404);
  await ctx.close();
});

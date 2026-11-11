import { expect, type Page } from '@playwright/test';

let counter = 0;
export function uniqueEmail(tag: string): string {
  counter += 1;
  return `e2e-${tag}-${Date.now()}-${counter}@example.com`;
}

export const PASSWORD = 'correct horse battery staple';

export async function signUp(page: Page, name: string, email: string) {
  await page.goto('/signup');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/trips$/);
}

/** Picks the first place suggestion matching `label`. */
export async function pickPlace(page: Page, field: string, query: string, label: string) {
  await page.getByRole('combobox', { name: field, exact: true }).fill(query);
  await page.getByRole('button', { name: new RegExp(label) }).first().click();
  await expect(page.getByRole('combobox', { name: field, exact: true })).toHaveCount(0);
}

/**
 * Around-a-date trip matching the recorded google_flights fixtures:
 * NYC → LIS around Dec 4 2026 with a return window (backs Dec 7).
 */
export async function createAroundDec4Trip(page: Page, returnWindow = true) {
  await page.goto('/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByRole('button', { name: 'Around a date' }).click();
  await page.getByLabel('Around', { exact: true }).fill('2026-12-04');
  if (returnWindow) await page.getByText('Return departs between').click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
}

export function tripIdFromUrl(page: Page): string {
  const m = /\/trips\/([0-9a-f-]{36})/.exec(page.url());
  if (!m) throw new Error(`not on a trip page: ${page.url()}`);
  return m[1];
}

export async function createTripWeekendsInNov2026(page: Page) {
  await page.goto('/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByLabel('Month').fill('2026-11');
  await expect(page.getByTestId('strategy-summary')).toContainText(
    'Weekends in Nov 2026',
  );
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
}

/**
 * Exact-dates trip. With TP_TEST_NOW pinned at 2026-10-30T12:00Z, calling
 * with '2026-10-29'/'2026-11-01' makes "today" Day 2 — deterministic for the
 * Today screen spec. (0 candidate pairs is fine; the trip still submits.)
 */
export async function createTripExactDates(page: Page, depart: string, ret: string) {
  await page.goto('/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByRole('button', { name: 'Exact dates' }).click();
  await page.getByLabel('Depart', { exact: true }).fill(depart);
  await page.getByLabel('Return', { exact: true }).fill(ret);
  await expect(page.getByTestId('strategy-summary')).toContainText('Exact dates');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
}

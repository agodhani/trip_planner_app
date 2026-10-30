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

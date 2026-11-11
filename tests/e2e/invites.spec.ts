import { expect, test } from '@playwright/test';
import {
  createTripWeekendsInNov2026,
  PASSWORD,
  signUp,
  uniqueEmail,
} from './helpers';

test('invite link: second user signs up through it and joins', async ({
  page,
  browser,
}) => {
  // Owner signs up and creates a trip.
  await signUp(page, 'E2E Inviter', uniqueEmail('inviter'));
  await createTripWeekendsInNov2026(page);
  const tripUrl = page.url();

  // Owner creates an editor invite link on the People tab.
  await page.getByRole('link', { name: 'People' }).click();
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = await page.locator('code').first().textContent();
  expect(inviteUrl).toContain('/invite/');

  // Second user, fresh browser context, opens the link logged out.
  const ctx = await browser.newContext();
  const joiner = await ctx.newPage();
  await joiner.goto(inviteUrl!);
  await expect(
    joiner.getByRole('heading', { name: /invited you to/ }),
  ).toBeVisible();
  await joiner.getByRole('link', { name: 'Sign up to join' }).click();

  await joiner.getByLabel('Name').fill('E2E Joiner');
  await joiner.getByLabel('Email').fill(uniqueEmail('joiner'));
  await joiner.getByLabel('Password').fill(PASSWORD);
  await joiner.getByRole('button', { name: 'Sign up' }).click();

  // Redirected back to the invite page, now logged in.
  await expect(joiner).toHaveURL(/\/invite\//);
  await joiner.getByRole('button', { name: /Join / }).click();
  await expect(joiner).toHaveURL(tripUrl);
  await expect(
    joiner.getByRole('heading', { name: 'Trip to Lisbon' }),
  ).toBeVisible();
  await ctx.close();

  // Owner sees the new member and the feed event.
  await page.getByRole('link', { name: 'People' }).click();
  await expect(page.getByText('E2E Joiner').first()).toBeVisible();
  await page.getByRole('link', { name: 'Overview' }).click();
  // exact: the pulse toast appends '· People' to the same text.
  await expect(
    page.getByText('E2E Joiner joined via an invite link', { exact: true }),
  ).toBeVisible();
});

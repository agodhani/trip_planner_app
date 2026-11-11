import { expect, test } from '@playwright/test';
import {
  createTripWeekendsInNov2026,
  PASSWORD,
  signUp,
  uniqueEmail,
} from './helpers';

/**
 * Trip pulse: a change made by the owner surfaces on the member's screen as a
 * toast + tab dot inside ~2 polls (NEXT_PUBLIC_PULSE_MS=1000 in
 * playwright.config), and both sides see each other as present.
 * Fully offline — the option is added through the manual-entry form.
 */
test('pulse: member sees a toast + tab dot for the owner’s change, and presence', async ({
  page: owner,
  browser,
}) => {
  await signUp(owner, 'Pulse Owner', uniqueEmail('pulse-owner'));
  await createTripWeekendsInNov2026(owner);
  const tripUrl = owner.url();

  // Owner creates an editor invite on the People tab.
  await owner.getByRole('link', { name: 'People' }).click();
  await owner.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = await owner.locator('code').first().textContent();
  expect(inviteUrl).toContain('/invite/');

  // Member joins in a second browser context and stays on the overview.
  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  try {
    await member.goto(inviteUrl!);
    await member.getByRole('link', { name: 'Sign up to join' }).click();
    await member.getByLabel('Name').fill('Pulse Member');
    await member.getByLabel('Email').fill(uniqueEmail('pulse-member'));
    await member.getByLabel('Password').fill(PASSWORD);
    await member.getByRole('button', { name: 'Sign up' }).click();
    await expect(member).toHaveURL(/\/invite\//);
    await member.getByRole('button', { name: /Join / }).click();
    await expect(member).toHaveURL(tripUrl);

    // Owner shortlists a manually-added activity.
    await owner.getByRole('link', { name: 'Activities', exact: true }).click();
    await owner.getByRole('button', { name: 'Add manually' }).click();
    await owner.getByPlaceholder('Activity name').fill('Museu do Fado');
    await owner.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(
      owner.getByText('Museu do Fado').first(),
    ).toBeVisible();

    // Member gets the toast within a couple of 1s polls.
    await expect(
      member
        .locator('[role="status"]')
        .filter({ hasText: 'Pulse Owner shortlisted Museu do Fado' }),
    ).toBeVisible({ timeout: 15_000 });

    // …and an unseen dot on the Activities tab.
    await expect(member.getByTestId('tab-dot-activities')).toBeVisible();

    // Presence: the owner's avatar carries the online dot for the member
    // (and vice versa on the owner's screen).
    await expect(
      member.locator('span[title="Pulse Owner — viewing now"]'),
    ).toBeVisible();
    await expect(
      owner.locator('span[title="Pulse Member — viewing now"]'),
    ).toBeVisible();

    // Visiting the tab clears the dot.
    await member.getByRole('link', { name: 'Activities', exact: true }).click();
    await expect(member.getByTestId('tab-dot-activities')).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

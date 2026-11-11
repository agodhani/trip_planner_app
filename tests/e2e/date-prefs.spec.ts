import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, pickPlace, signUp, uniqueEmail } from './helpers';

/**
 * Group availability on candidate date pairs: members mark Works / Maybe /
 * Can't on the "Pick your dates" grid, the aggregate line stays honest
 * (unanswered members are uncommitted), the best-for-group badge follows
 * the domain ordering, and picking a can't-marked pair shows a
 * non-blocking warning. The pref events map to the flights tab so the
 * pulse toast's View jump lands on the pair grid.
 */
async function createAroundDec4Trip(page: Page) {
  await page.goto('/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByRole('button', { name: 'Around a date' }).click();
  await page.getByLabel('Around', { exact: true }).fill('2026-12-04');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
}

// Each priced card carries a "Your availability for …" segmented control.
const prefGroup = (page: Page, i: number) =>
  page.getByRole('group', { name: /Your availability for/ }).nth(i);
const prefCard = (page: Page, i: number) =>
  prefGroup(page, i).locator('..').locator('..');
const pickButton = (page: Page, i: number) =>
  prefCard(page, i).getByRole('button').filter({ hasText: 'Dec' }).first();

test('date pair availability: marks, honest counts, best-for-group, warning, pulse View', async ({
  page: owner,
  browser,
}) => {
  await signUp(owner, 'Pref Owner', uniqueEmail('pref-owner'));
  await createAroundDec4Trip(owner);
  const tripUrl = owner.url();

  // Invite a second member (editor role) — they respond on their own behalf.
  await owner.getByRole('link', { name: 'People' }).click();
  await owner.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = await owner.locator('code').first().textContent();
  expect(inviteUrl).toContain('/invite/');

  // Member joins through the invite link in a separate context.
  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  await member.goto(inviteUrl!);
  await member.getByRole('link', { name: 'Sign up to join' }).click();
  await member.getByLabel('Name').fill('Pref Member');
  await member.getByLabel('Email').fill(uniqueEmail('pref-member'));
  await member.getByLabel('Password').fill(PASSWORD);
  await member.getByRole('button', { name: 'Sign up' }).click();
  await expect(member).toHaveURL(/\/invite\//);
  await member.getByRole('button', { name: /Join / }).click();
  await expect(member).toHaveURL(tripUrl);

  // Owner runs the fixture-replayed scan so priced pair cards render.
  await owner.getByRole('link', { name: 'Flights', exact: true }).click();
  await owner.getByRole('button', { name: 'Search flights' }).click();
  await expect(prefGroup(owner, 0)).toBeVisible({ timeout: 60_000 });
  await expect(prefGroup(owner, 1)).toBeVisible();

  // Owner marks the first priced pair Works — the card reports honestly
  // that only one of the two members has answered.
  await prefGroup(owner, 0).getByRole('button', { name: 'Works' }).click();
  await expect(
    prefGroup(owner, 0).getByRole('button', { name: 'Works' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(prefCard(owner, 0)).toContainText('1 works — of 2 members');

  // Owner steps away from the flights tab so the member's mark arrives as a
  // pulse toast rather than an in-place refresh.
  await owner.getByRole('link', { name: 'Overview', exact: true }).click();

  // Member sees the finished scan and the owner's mark, then marks the
  // second priced pair Can't.
  await member.getByRole('link', { name: 'Flights', exact: true }).click();
  await expect(prefGroup(member, 0)).toBeVisible({ timeout: 30_000 });
  await expect(prefCard(member, 0)).toContainText('1 works — of 2 members');
  await prefGroup(member, 1).getByRole('button', { name: 'Can’t' }).click();
  await expect(
    prefGroup(member, 1).getByRole('button', { name: 'Can’t' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(prefCard(member, 1)).toContainText("1 can't — of 2 members");

  // Member's grid agrees: the works-marked pair carries the badge.
  await expect(
    prefCard(member, 0).getByTestId('best-for-group'),
  ).toBeVisible();
  await expect(prefCard(member, 1).getByTestId('best-for-group')).toHaveCount(0);
  // The member's 'dates.pref_set' event surfaces as a toast pointing at
  // Flights — the pair grid is where availability lives. Keep the member
  // context open until the toast arrives: the pressed state is optimistic,
  // so closing early can abort the action mid-flight and no event commits.
  const toast = owner
    .locator('[role="status"]')
    .filter({ hasText: 'marked' })
    .filter({ hasText: 'Flights' })
    .last();
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await ctx.close();
  await toast.getByRole('button', { name: 'View' }).click();
  await expect(owner).toHaveURL(/\/trips\/[0-9a-f-]{36}\/flights$/);

  // On the pair grid the counts now reflect both members.
  await expect(prefCard(owner, 0)).toContainText('1 works — of 2 members');
  await expect(prefCard(owner, 1)).toContainText("1 can't — of 2 members");
  await expect(prefCard(owner, 0).getByTestId('best-for-group')).toBeVisible();

  // Picking the can't-marked pair raises an informational warning — it does
  // not gate the select flow.
  await pickButton(owner, 1).click();
  await expect(owner.getByTestId('pair-no-warning')).toContainText(
    'Pref Member marked these dates',
  );
  await expect(
    owner.getByRole('button', { name: 'Select this outbound' }).first(),
  ).toBeVisible({ timeout: 30_000 });

  // The works-marked pair never warns.
  await pickButton(owner, 0).click();
  await expect(owner.getByTestId('pair-no-warning')).toHaveCount(0);
});

test('date pair availability is hidden for exact-date trips', async ({ page }) => {
  await signUp(page, 'Pref Exact', uniqueEmail('pref-exact'));
  await page.goto('/trips/new');
  await pickPlace(page, 'From', 'new york', 'New York, US');
  await pickPlace(page, 'To', 'lisbon', 'Lisbon, PT');
  await page.getByRole('button', { name: 'Exact dates' }).click();
  await page.getByLabel('Depart', { exact: true }).fill('2026-12-04');
  await page.getByLabel('Return', { exact: true }).fill('2026-12-07');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);

  // A single candidate pair means there is nothing to coordinate — even if a
  // scan existed, the availability layer must not render.
  await page.getByRole('link', { name: 'Flights', exact: true }).click();
  await expect(
    page.getByRole('group', { name: /Your availability for/ }),
  ).toHaveCount(0);
});

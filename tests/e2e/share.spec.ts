import { expect, test } from '@playwright/test';
import { createTripExactDates, signUp, uniqueEmail } from './helpers';

test('public share link: read-only itinerary for anyone, revocable', async ({
  page,
  browser,
}) => {
  // Owner signs up and creates an exact-dates trip (Dec 4–7, 2026).
  await signUp(page, 'E2E Sharer', uniqueEmail('share'));
  await createTripExactDates(page, '2026-12-04', '2026-12-07');

  // Add a manual flight and select it — manual data only, zero provider calls.
  await page.getByRole('link', { name: 'Flights', exact: true }).click();
  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByLabel('Airline code').fill('TP');
  await page.getByLabel('Flight number').fill('202');
  await page.getByLabel('From airport').fill('JFK');
  await page.getByLabel('To airport').fill('LIS');
  await page.getByLabel('Departs', { exact: true }).fill('2026-12-04T20:15');
  await page.getByLabel('Arrives', { exact: true }).fill('2026-12-05T08:00');
  await page.getByLabel('Total price').fill('1320');
  await page.getByLabel('Confirmation #').fill('E2E123');
  await page.getByRole('button', { name: 'Add flight' }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByText('selected').first()).toBeVisible({ timeout: 15_000 });

  // A day-by-day itinerary item.
  await page.getByRole('link', { name: 'Itinerary', exact: true }).click();
  await page.getByPlaceholder('Title').fill('E2E Alfama walk');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('E2E Alfama walk').first()).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Move to day').first().selectOption({ index: 1 });

  // Owner creates a public link on the People tab.
  await page.getByRole('link', { name: 'People' }).click();
  await page.getByRole('button', { name: 'Create public link' }).click();
  const shareUrl = await page.locator('code').first().textContent();
  expect(shareUrl).toContain('/share/');

  // A stranger — fresh unauthenticated context — opens the link.
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(shareUrl!);

  // Header: trip name, route, dates, travelers' first names only.
  await expect(
    guest.getByRole('heading', { name: 'Trip to Lisbon' }),
  ).toBeVisible();
  await expect(guest.getByText('New York → Lisbon')).toBeVisible();
  await expect(guest.getByText(/Dec 4.*Dec 7/)).toBeVisible();
  await expect(guest.getByText('Travelers: E2E')).toBeVisible();

  // Selected flight with leg times, airports, and the booking reference.
  const flights = guest.getByTestId('share-flights');
  await expect(flights.getByText(/JFK → /)).toBeVisible();
  await expect(flights.getByText('TP 202').first()).toBeVisible();
  await expect(flights.getByText('Confirmation E2E123')).toBeVisible();

  // Day-by-day items render; the unscheduled pool stays visible too.
  const days = guest.getByTestId('share-days');
  await expect(days.getByText('E2E Alfama walk')).toBeVisible();

  // Privacy boundary: no member-only chrome or data anywhere.
  for (const affordance of [
    'Budget',
    'Log',
    'People',
    'Shortlist',
    'Compare',
  ]) {
    await expect(guest.getByRole('link', { name: affordance })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: affordance })).toHaveCount(0);
  }
  await expect(guest.getByText(/@example\.com/)).toHaveCount(0);
  // The page asks crawlers not to index it.
  await expect(guest.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );

  // Revoke → the same link renders the friendly unavailable page.
  const publicLinkCard = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Public link' }),
  });
  await publicLinkCard.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('No active public links.')).toBeVisible({ timeout: 15_000 });
  await guest.reload();
  await expect(guest.getByTestId('share-unavailable')).toBeVisible();
  await expect(guest.getByText('E2E Alfama walk')).toHaveCount(0);

  // Garbage tokens get the same page — validity is never leaked.
  await guest.goto('/share/not-a-real-token');
  await expect(guest.getByTestId('share-unavailable')).toBeVisible();
  await ctx.close();
});

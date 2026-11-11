import { expect, test } from '@playwright/test';
import {
  createTripWeekendsInNov2026,
  signUp,
  uniqueEmail,
} from './helpers';

// TP_TEST_NOW is pinned to 2026-10-30T12:00Z, so a task due 2026-10-31
// renders "Due Oct 31 · in 1 day" deterministically.
test('Who\'s on it: create → assign → toggle → activity event → delete', async ({
  page,
}) => {
  await signUp(page, 'E2E Tasks', uniqueEmail('tasks'));
  await createTripWeekendsInNov2026(page);
  const card = page.getByTestId('trip-tasks');

  await expect(
    page.getByRole('heading', { name: "Who's on it" }),
  ).toBeVisible();
  await expect(page.getByTestId('tasks-done-count')).toHaveText('0 of 0 done');

  // Create an assigned task (the owner's traveler row exists already).
  const addForm = card.getByTestId('task-add');
  await addForm.getByText('Add a task').click();
  await addForm.getByLabel('Title').fill('Book airport transfer');
  await addForm.getByLabel('Assignee').selectOption({ label: 'E2E Tasks' });
  await addForm.getByLabel('Due').fill('2026-10-31');
  await card.getByRole('button', { name: 'Add task' }).click();

  await expect(card.getByText('Book airport transfer')).toBeVisible();
  await expect(card.getByText(/Due Oct 31/)).toBeVisible();
  await expect(page.getByTestId('tasks-done-count')).toHaveText('0 of 1 done');
  await expect(page.getByTestId('tasks-nudge')).toContainText(
    "You're assigned 1 open task",
  );

  // Toggle done via the checkbox — count + activity feed update.
  await card
    .getByRole('checkbox', { name: 'Mark task Book airport transfer done' })
    .click();
  await expect(page.getByTestId('tasks-done-count')).toHaveText('1 of 1 done');
  await expect(
    page.getByText('E2E Tasks completed task Book airport transfer').first(),
  ).toBeVisible();

  // Delete it.
  await card
    .getByRole('button', { name: 'Delete task Book airport transfer' })
    .click();
  await expect(card.getByText('Book airport transfer')).toHaveCount(0);
  await expect(page.getByTestId('tasks-done-count')).toHaveText('0 of 0 done');
});

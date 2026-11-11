'use client';

import { useActionState, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  addTaskAction,
  deleteTaskAction,
  toggleTaskAction,
  updateTaskAction,
} from '@/lib/actions/tasks';
import type { ActionState } from '@/lib/actions/people';
import { SubmitButton } from '@/components/submit-button';
import { ui } from '@/components/shortlisted-options';
import { dueBadge, groupTasks, type TaskRow } from '@/lib/domain/tasks';
import { plural, shortDate } from '@/lib/ui-format';

const { btn, card, inp } = ui;
const lbl = 'flex flex-col gap-1 text-xs font-medium text-neutral-600';
const summaryCls =
  'inline-flex cursor-pointer list-none items-center text-xs font-medium text-teal-700 hover:underline [&::-webkit-details-marker]:hidden';

export type TaskView = TaskRow & {
  /** Display name of the assignee traveler (null when unassigned). */
  assigneeName: string | null;
  /** Server-computed: this user may flip done (editor+, or own assignee). */
  canToggle: boolean;
  doneByName: string | null;
};

export type TravelerOption = { id: string; name: string };

function AssigneeSelect({
  travelers,
  defaultValue,
}: {
  travelers: TravelerOption[];
  defaultValue: string;
}) {
  return (
    <select
      name="assigneeTravelerId"
      defaultValue={defaultValue}
      aria-label="Assignee"
      className={inp}
    >
      <option value="">Unassigned</option>
      {travelers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

function DuePill({
  dueOn,
  today,
  done,
}: {
  dueOn: string | null;
  today: string;
  done: boolean;
}) {
  const b = dueBadge(dueOn, today, done);
  if (b.kind === 'none' || !dueOn) return null;
  if (b.kind === 'overdue') {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
        Overdue by {plural(b.days, 'day')}
      </span>
    );
  }
  if (b.kind === 'today') {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Due today
      </span>
    );
  }
  return (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
      Due {shortDate(dueOn)} · in {plural(b.days, 'day')}
    </span>
  );
}

function AddTaskForm({
  tripId,
  travelers,
}: {
  tripId: string;
  travelers: TravelerOption[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    addTaskAction,
    {},
  );
  // Remount the (uncontrolled) form after a successful add so its inputs
  // clear; on error the state object still changes but we keep the values.
  const [resetKey, setResetKey] = useState(0);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (!state.error) setResetKey((k) => k + 1);
  }
  return (
    <details className="mb-3" data-testid="task-add">
      <summary className={summaryCls}>Add a task</summary>
      <form
        key={resetKey}
        action={action}
        className="mt-2 flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
      >
        <input type="hidden" name="tripId" value={tripId} />
        <label className={lbl}>
          Title
          <input
            name="title"
            required
            maxLength={200}
            placeholder="e.g. Book the airport transfer"
            className={inp}
          />
        </label>
        <label className={lbl}>
          Details
          <input
            name="details"
            maxLength={2000}
            placeholder="Optional notes"
            className={inp}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <label className={lbl}>
            Assignee
            <AssigneeSelect travelers={travelers} defaultValue="" />
          </label>
          <label className={lbl}>
            Due
            <input type="date" name="dueOn" className={inp} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton className={btn}>Add task</SubmitButton>
          {state.error && (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}

function EditTaskForm({
  tripId,
  task,
  travelers,
}: {
  tripId: string;
  task: TaskView;
  travelers: TravelerOption[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateTaskAction,
    {},
  );
  return (
    <details className="mt-1">
      <summary className={summaryCls}>Edit</summary>
      {/* key remounts uncontrolled inputs after a save refreshes the task. */}
      <form
        key={`${task.title}|${task.details}|${task.assigneeTravelerId}|${task.dueOn}`}
        action={action}
        className="mt-2 flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
      >
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="taskId" value={task.id} />
        <label className={lbl}>
          Title
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={task.title}
            className={inp}
          />
        </label>
        <label className={lbl}>
          Details
          <input
            name="details"
            maxLength={2000}
            defaultValue={task.details ?? ''}
            className={inp}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <label className={lbl}>
            Assignee
            <AssigneeSelect
              travelers={travelers}
              defaultValue={task.assigneeTravelerId ?? ''}
            />
          </label>
          <label className={lbl}>
            Due
            <input
              type="date"
              name="dueOn"
              defaultValue={task.dueOn ?? ''}
              className={inp}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton className={btn}>Save task</SubmitButton>
          {state.error && (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}

function TaskRowItem({
  tripId,
  task,
  canEdit,
  travelers,
  today,
}: {
  tripId: string;
  task: TaskView;
  canEdit: boolean;
  travelers: TravelerOption[];
  today: string;
}) {
  return (
    <li className="border-b border-neutral-100 py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        <form action={toggleTaskAction} className="pt-0.5">
          <input type="hidden" name="tripId" value={tripId} />
          <input type="hidden" name="taskId" value={task.id} />
          {/* `done` is the target state, not the current one. */}
          <input type="hidden" name="done" value={task.done ? '0' : '1'} />
          <input
            // Uncontrolled + remount on done flips: a controlled `checked`
            // races the server refresh and can wedge the DOM checkbox.
            key={String(task.done)}
            type="checkbox"
            defaultChecked={task.done}
            disabled={!task.canToggle}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            aria-label={
              task.done
                ? `Reopen task ${task.title}`
                : `Mark task ${task.title} done`
            }
            className="h-4 w-4 rounded border-neutral-300 text-teal-600 accent-teal-600 focus:ring-teal-500 disabled:opacity-40"
          />
        </form>
        <div className="min-w-0 flex-1">
          <span
            className={
              task.done
                ? 'text-sm text-neutral-400 line-through'
                : 'text-sm font-medium'
            }
          >
            {task.title}
          </span>
          {task.details && (
            <p className="text-xs text-neutral-500">{task.details}</p>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <DuePill dueOn={task.dueOn} today={today} done={task.done} />
            {task.done && task.doneByName && (
              <span className="text-xs text-neutral-400">
                Done by {task.doneByName}
              </span>
            )}
          </span>
          {canEdit && (
            <EditTaskForm tripId={tripId} task={task} travelers={travelers} />
          )}
        </div>
        {canEdit && (
          <form action={deleteTaskAction}>
            <input type="hidden" name="tripId" value={tripId} />
            <input type="hidden" name="taskId" value={task.id} />
            <SubmitButton
              className="rounded-md border border-neutral-200 p-1 text-neutral-500 hover:bg-neutral-100 hover:text-red-600"
              aria-label={`Delete task ${task.title}`}
              title="Delete task"
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}

/**
 * The "Who's on it" card on the Overview: group-assigned work with due
 * dates — distinct from the derived Planning checklist.
 */
export function TripTasks({
  tripId,
  canEdit,
  tasks,
  travelers,
  today,
  mineOpen,
}: {
  tripId: string;
  canEdit: boolean;
  tasks: TaskView[];
  travelers: TravelerOption[];
  /** Destination-local 'YYYY-MM-DD' — keeps badges deterministic. */
  today: string;
  /** Open tasks assigned to the current user's traveler row. */
  mineOpen: number;
}) {
  const doneCount = tasks.filter((t) => t.done).length;
  const groups = groupTasks(tasks);
  const nameOf = (travelerId: string) =>
    travelers.find((t) => t.id === travelerId)?.name ?? 'Unknown traveler';

  return (
    <section className={card} data-testid="trip-tasks">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Who&apos;s on it</h2>
        <span className="text-xs text-neutral-500" data-testid="tasks-done-count">
          {doneCount} of {tasks.length} done
        </span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        Work the group has assigned — separate from the planning checklist.
      </p>
      {mineOpen > 0 && (
        <p
          className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800"
          data-testid="tasks-nudge"
        >
          You&apos;re assigned {plural(mineOpen, 'open task')}
        </p>
      )}
      {canEdit && <AddTaskForm tripId={tripId} travelers={travelers} />}
      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No tasks yet{canEdit ? ' — add the first one above' : ''}.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.assigneeTravelerId ?? 'unassigned'}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {g.assigneeTravelerId
                  ? nameOf(g.assigneeTravelerId)
                  : 'Unassigned'}
              </h3>
              <ul>
                {g.tasks.map((t) => (
                  <TaskRowItem
                    key={t.id}
                    tripId={tripId}
                    task={t}
                    canEdit={canEdit}
                    travelers={travelers}
                    today={today}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * "Who's on it" — group-assigned trip tasks. Pure logic: ordering, due
 * badges, assignee grouping, and the toggle-permission rule. No I/O;
 * unit-tested. Callers pass `today` as the destination-local 'YYYY-MM-DD'
 * (from the pinnable clock, src/lib/clock.ts) so badges never depend on
 * real time.
 */

export type TaskRow = {
  id: string;
  title: string;
  details: string | null;
  /** travelers.id, or null = unassigned. */
  assigneeTravelerId: string | null;
  /** 'YYYY-MM-DD' or null = no due date. */
  dueOn: string | null;
  done: boolean;
  sortOrder: number;
};

export type DueBadge =
  | { kind: 'overdue'; days: number }
  | { kind: 'today' }
  | { kind: 'upcoming'; days: number }
  | { kind: 'none' };

const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const dayDiff = (fromIso: string, toIso: string) =>
  Math.round((dayMs(toIso) - dayMs(fromIso)) / 86_400_000);

/**
 * Due badge vs destination-local today. Done tasks never show a badge —
 * their due date is history. Unparseable dates degrade to 'none' rather
 * than warn, matching the opening-hours convention.
 */
export function dueBadge(
  dueOn: string | null,
  today: string,
  done = false,
): DueBadge {
  if (done || !dueOn) return { kind: 'none' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || Number.isNaN(dayMs(dueOn))) {
    return { kind: 'none' };
  }
  const diff = dayDiff(today, dueOn);
  if (diff < 0) return { kind: 'overdue', days: -diff };
  if (diff === 0) return { kind: 'today' };
  return { kind: 'upcoming', days: diff };
}

/**
 * Sort rank: open tasks with a due date come first (due-date ascending —
 * overdue leads because its dates are earliest), then the undated bucket,
 * which also collects done tasks (their due dates are history).
 */
function dueRank(task: TaskRow): number {
  return !task.done && task.dueOn ? 0 : 1;
}

function compareTasks(a: TaskRow, b: TaskRow): number {
  const ra = dueRank(a);
  const rb = dueRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0 && a.dueOn !== b.dueOn) {
    return a.dueOn! < b.dueOn! ? -1 : 1;
  }
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Tasks in display order: overdue → due-date asc → undated/done, sortOrder ties. */
export function orderTasks<T extends TaskRow>(tasks: T[]): T[] {
  return [...tasks].sort(compareTasks);
}

export type TaskGroup<T extends TaskRow = TaskRow> = {
  /** null = the unassigned bucket, always rendered last. */
  assigneeTravelerId: string | null;
  tasks: T[];
};

/**
 * Group the ordered task list by assignee. Group order follows first
 * appearance in the sorted list — so the group holding the most urgent
 * task leads — with the unassigned bucket pinned last.
 */
export function groupTasks<T extends TaskRow>(tasks: T[]): TaskGroup<T>[] {
  const groups = new Map<string | null, T[]>();
  for (const t of orderTasks(tasks)) {
    const key = t.assigneeTravelerId;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  const out: TaskGroup<T>[] = [];
  for (const [assigneeTravelerId, list] of groups) {
    if (assigneeTravelerId !== null) out.push({ assigneeTravelerId, tasks: list });
  }
  const unassigned = groups.get(null);
  if (unassigned) out.push({ assigneeTravelerId: null, tasks: unassigned });
  return out;
}

// ----- permissions -----

/** Owners/editors manage tasks; viewers are read-only (except toggling). */
export function canMutateTasks(role: string): boolean {
  return role === 'owner' || role === 'editor';
}

/**
 * Editors+ toggle anything. Any member — even a viewer — may toggle a
 * task assigned to the traveler row linked to their account
 * (travelers.userId === user.id); unassigned tasks can't be toggled by
 * viewers.
 */
export function canToggleTask(
  role: string,
  assigneeUserId: string | null,
  userId: string,
): boolean {
  if (canMutateTasks(role)) return true;
  return assigneeUserId !== null && assigneeUserId === userId;
}

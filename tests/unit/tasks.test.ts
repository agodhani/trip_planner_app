import { describe, expect, it } from 'vitest';
import {
  canMutateTasks,
  canToggleTask,
  dueBadge,
  groupTasks,
  orderTasks,
  type TaskRow,
} from '@/lib/domain/tasks';

const TODAY = '2026-10-30';

const task = (id: string, over: Partial<TaskRow> = {}): TaskRow => ({
  id,
  title: `Task ${id}`,
  details: null,
  assigneeTravelerId: null,
  dueOn: null,
  done: false,
  sortOrder: 0,
  ...over,
});

const ids = (list: TaskRow[]) => list.map((t) => t.id);

describe('dueBadge', () => {
  it('no due date means no badge', () => {
    expect(dueBadge(null, TODAY)).toEqual({ kind: 'none' });
  });

  it('boundary: due today is "today", day before is overdue, day after is upcoming', () => {
    expect(dueBadge('2026-10-30', TODAY)).toEqual({ kind: 'today' });
    expect(dueBadge('2026-10-29', TODAY)).toEqual({ kind: 'overdue', days: 1 });
    expect(dueBadge('2026-10-31', TODAY)).toEqual({ kind: 'upcoming', days: 1 });
  });

  it('counts overdue and upcoming days', () => {
    expect(dueBadge('2026-10-20', TODAY)).toEqual({ kind: 'overdue', days: 10 });
    expect(dueBadge('2026-11-15', TODAY)).toEqual({ kind: 'upcoming', days: 16 });
  });

  it('done tasks never warn, and junk dates degrade to none', () => {
    expect(dueBadge('2026-10-01', TODAY, true)).toEqual({ kind: 'none' });
    expect(dueBadge('not-a-date', TODAY)).toEqual({ kind: 'none' });
    expect(dueBadge('2026-13-99', TODAY)).toEqual({ kind: 'none' });
  });
});

describe('orderTasks', () => {
  it('overdue first, then due-date ascending, then no-due', () => {
    const out = orderTasks(
      [
        task('noDue'),
        task('future', { dueOn: '2026-11-05' }),
        task('overdue', { dueOn: '2026-10-20' }),
        task('soon', { dueOn: '2026-10-31' }),
        task('today', { dueOn: '2026-10-30' }),
      ],
    );
    expect(ids(out)).toEqual(['overdue', 'today', 'soon', 'future', 'noDue']);
  });

  it('falls back to sortOrder on ties', () => {
    const out = orderTasks(
      [
        task('b', { dueOn: '2026-10-29', sortOrder: 2 }),
        task('a', { dueOn: '2026-10-29', sortOrder: 1 }),
        task('c', { sortOrder: 0 }),
        task('d', { sortOrder: -1 }),
      ],
    );
    expect(ids(out)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('done tasks lose their urgency and sink into the undated bucket', () => {
    const out = orderTasks(
      [
        task('doneOverdue', { dueOn: '2026-10-01', done: true }),
        task('open', { dueOn: '2026-11-01' }),
      ],
    );
    expect(ids(out)).toEqual(['open', 'doneOverdue']);
  });
});

describe('groupTasks', () => {
  it('groups by assignee with the unassigned bucket last', () => {
    const groups = groupTasks(
      [
        task('free', {}),
        task('alice1', { assigneeTravelerId: 'ta', dueOn: '2026-10-29' }),
        task('bob1', { assigneeTravelerId: 'tb', dueOn: '2026-10-25' }),
      ],
    );
    expect(groups.map((g) => g.assigneeTravelerId)).toEqual(['tb', 'ta', null]);
  });

  it('keeps due-urgency order inside each group', () => {
    const groups = groupTasks(
      [
        task('a-later', { assigneeTravelerId: 'ta', dueOn: '2026-11-05' }),
        task('a-first', { assigneeTravelerId: 'ta', dueOn: '2026-10-28' }),
      ],
    );
    expect(groups).toHaveLength(1);
    expect(ids(groups[0].tasks)).toEqual(['a-first', 'a-later']);
  });

  it('orders groups by first appearance in the sorted list', () => {
    // Bob's overdue task outranks Alice's undated one, so Bob's group leads.
    const groups = groupTasks(
      [
        task('a1', { assigneeTravelerId: 'ta' }),
        task('b1', { assigneeTravelerId: 'tb', dueOn: '2026-10-01' }),
      ],
    );
    expect(groups.map((g) => g.assigneeTravelerId)).toEqual(['tb', 'ta']);
  });
});

describe('permissions', () => {
  it('editors and owners mutate; viewers do not', () => {
    expect(canMutateTasks('owner')).toBe(true);
    expect(canMutateTasks('editor')).toBe(true);
    expect(canMutateTasks('viewer')).toBe(false);
  });

  it('editors toggle any task', () => {
    expect(canToggleTask('editor', 'someone-else', 'me')).toBe(true);
    expect(canToggleTask('owner', null, 'me')).toBe(true);
  });

  it('a member toggles only tasks assigned to their own traveler row', () => {
    expect(canToggleTask('viewer', 'me', 'me')).toBe(true);
    expect(canToggleTask('viewer', 'someone-else', 'me')).toBe(false);
    expect(canToggleTask('viewer', null, 'me')).toBe(false);
  });
});

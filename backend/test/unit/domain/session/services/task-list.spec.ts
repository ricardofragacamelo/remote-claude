import { describe, expect, it } from 'vitest';

import type { TaskItem } from '@domain/engine';
import { TaskListTracker, applyTaskStep } from '@domain/session';

const task = (id: string, overrides: Partial<TaskItem> = {}): TaskItem => ({
  id,
  title: `Task ${id}`,
  activeTitle: null,
  status: 'pending',
  ...overrides,
});

const LIST: readonly TaskItem[] = [task('1'), task('2', { activeTitle: 'Doing 2' })];

describe('applyTaskStep — plan 28, B-22, S-66', () => {
  it('replaces the whole list, whatever it held', () => {
    const next = [task('x', { status: 'completed' })];

    expect(applyTaskStep(LIST, { op: 'replace', tasks: next }, null)).toBe(next);
    expect(applyTaskStep(LIST, { op: 'replace', tasks: [] }, null)).toEqual([]);
  });

  it('adds a created task at the end, pending, under the id its result gave', () => {
    expect(applyTaskStep(LIST, { op: 'create', title: 'New', activeTitle: 'Making' }, '3')).toEqual(
      [...LIST, { id: '3', title: 'New', activeTitle: 'Making', status: 'pending' }],
    );
    expect(applyTaskStep([], { op: 'create', title: 'First', activeTitle: null }, '1')).toEqual([
      { id: '1', title: 'First', activeTitle: null, status: 'pending' },
    ]);
  });

  it('creates nothing when the result gave no id', () => {
    expect(applyTaskStep(LIST, { op: 'create', title: 'New', activeTitle: null }, null)).toBeNull();
  });

  it('changes only what an update says, and only of its task', () => {
    expect(applyTaskStep(LIST, { op: 'update', id: '2', status: 'inProgress' }, null)).toEqual([
      task('1'),
      task('2', { activeTitle: 'Doing 2', status: 'inProgress' }),
    ]);
    expect(
      applyTaskStep(
        LIST,
        { op: 'update', id: '1', title: 'Renamed', activeTitle: 'Renaming', status: 'completed' },
        null,
      ),
    ).toEqual([
      { id: '1', title: 'Renamed', activeTitle: 'Renaming', status: 'completed' },
      LIST[1],
    ]);
    expect(applyTaskStep(LIST, { op: 'update', id: '1' }, '1')).toEqual(LIST);
  });

  it('removes a deleted task, and keeps the order of the rest', () => {
    const three = [...LIST, task('3')];

    expect(applyTaskStep(three, { op: 'update', id: '2', status: 'deleted' }, null)).toEqual([
      task('1'),
      task('3'),
    ]);
    expect(applyTaskStep([task('1')], { op: 'update', id: '1', status: 'deleted' }, null)).toEqual(
      [],
    );
  });

  it('applies nothing to a task the list does not have', () => {
    expect(applyTaskStep(LIST, { op: 'update', id: '9', status: 'completed' }, null)).toBeNull();
    expect(applyTaskStep([], { op: 'update', id: '1', status: 'deleted' }, null)).toBeNull();
  });
});

describe('TaskListTracker — plan 28, B-22, S-66', () => {
  it('applies a step when its call succeeds, and hands back the whole list', () => {
    const tracker = new TaskListTracker();
    tracker.started('t-1', { op: 'create', title: 'A', activeTitle: null });
    tracker.started('t-2', { op: 'create', title: 'B', activeTitle: null });

    expect(tracker.completed('t-1', { succeeded: true, taskId: '1' })).toEqual([
      { id: '1', title: 'A', activeTitle: null, status: 'pending' },
    ]);
    expect(tracker.completed('t-2', { succeeded: true, taskId: '2' })).toEqual([
      { id: '1', title: 'A', activeTitle: null, status: 'pending' },
      { id: '2', title: 'B', activeTitle: null, status: 'pending' },
    ]);
  });

  it('changes nothing for a call that failed, and the next call builds on the list as it was', () => {
    const tracker = new TaskListTracker();
    tracker.started('t-1', { op: 'replace', tasks: [task('1')] });
    tracker.started('t-2', { op: 'replace', tasks: [task('9')] });
    tracker.started('t-3', { op: 'update', id: '1', status: 'completed' });

    expect(tracker.completed('t-1', { succeeded: true, taskId: null })).toEqual([task('1')]);
    expect(tracker.completed('t-2', { succeeded: false, taskId: null })).toBeNull();
    expect(tracker.completed('t-3', { succeeded: true, taskId: null })).toEqual([
      task('1', { status: 'completed' }),
    ]);
  });

  it('knows nothing of a call it never saw start, nor of one already ended — S-67', () => {
    const tracker = new TaskListTracker();
    tracker.started('t-1', { op: 'replace', tasks: [task('1')] });

    expect(tracker.completed('other', { succeeded: true, taskId: null })).toBeNull();
    expect(tracker.completed('t-1', { succeeded: true, taskId: null })).toEqual([task('1')]);
    // The same end twice is one change: the second finds no step left.
    expect(tracker.completed('t-1', { succeeded: true, taskId: null })).toBeNull();
  });

  it('keeps the list as it was when a step does not apply', () => {
    const tracker = new TaskListTracker();
    tracker.started('t-1', { op: 'replace', tasks: [task('1')] });
    tracker.completed('t-1', { succeeded: true, taskId: null });
    tracker.started('t-2', { op: 'update', id: '7', status: 'completed' });
    tracker.started('t-3', { op: 'create', title: 'No id', activeTitle: null });
    tracker.started('t-4', { op: 'update', id: '1', status: 'inProgress' });

    expect(tracker.completed('t-2', { succeeded: true, taskId: '7' })).toBeNull();
    expect(tracker.completed('t-3', { succeeded: true, taskId: null })).toBeNull();
    expect(tracker.completed('t-4', { succeeded: true, taskId: null })).toEqual([
      task('1', { status: 'inProgress' }),
    ]);
  });
});

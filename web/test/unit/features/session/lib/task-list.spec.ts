import { describe, expect, it } from 'vitest';

import { changesTaskList, taskListOf } from '@/features/session/lib/task-list';
import type { ToolExecution } from '@/features/session/types/live-session';

let next = 0;

/** A call of a tool, ended well unless told otherwise. */
function call(
  toolName: string,
  input: Record<string, unknown>,
  extra: Partial<ToolExecution> = {},
): ToolExecution {
  next += 1;
  return {
    toolUseId: `t-${String(next)}`,
    toolName,
    input,
    status: 'succeeded',
    elapsed: null,
    summary: null,
    parentToolUseId: null,
    taskId: null,
    ...extra,
  };
}

const todo = (content: string, status: string) => ({
  content,
  status,
  activeForm: `Doing ${content}`,
});

/** `[title, state, was]` of each item. */
const shape = (tools: readonly ToolExecution[]) =>
  taskListOf(tools).items.map((item) => [item.title, item.state, item.was]);

describe('the task list, from the calls of its tools — plan 08 B-20', () => {
  describe('by `TodoWrite`: the whole list every time', () => {
    it('is the list of the last call, with what each task was before it — S-85, S-87', () => {
      expect(
        shape([
          call('TodoWrite', { todos: [todo('a', 'pending'), todo('b', 'pending')] }),
          call('TodoWrite', { todos: [todo('a', 'in_progress'), todo('b', 'pending')] }),
        ]),
      ).toEqual([
        ['a', 'inProgress', 'pending'],
        ['b', 'pending', null],
      ]);
    });

    it('is emptied by an empty list — S-86', () => {
      const tools = [
        call('TodoWrite', { todos: [todo('a', 'pending')] }),
        call('TodoWrite', { todos: [] }),
      ];

      expect(taskListOf(tools).items).toEqual([]);
      expect(taskListOf(tools).absorbed.size).toBe(2);
    });

    it.each([
      ['no list', {}],
      ['a list that is not one', { todos: 'a, b' }],
      ['an item with no text', { todos: [{ status: 'pending' }] }],
      ['an item of a state it does not know', { todos: [todo('a', 'blocked')] }],
      ['an item that is not an object', { todos: ['a'] }],
    ])('reads nothing of a call with %s, and leaves it a tool — S-86', (_, input) => {
      const malformed = call('TodoWrite', input);
      const list = taskListOf([call('TodoWrite', { todos: [todo('a', 'pending')] }), malformed]);

      expect(list.items.map((item) => item.title)).toEqual(['a']);
      expect(list.absorbed.has(malformed.toolUseId)).toBe(false);
    });

    it('says of an item what it is called while it runs, or its text when it has none', () => {
      const [item] = taskListOf([
        call('TodoWrite', { todos: [{ content: 'plain', status: 'in_progress' }] }),
      ]).items;

      expect(item).toMatchObject({ activeForm: 'plain', id: null });
    });
  });

  describe('by `TaskCreate` and `TaskUpdate`: one task at a time, by its id', () => {
    const created = (subject: string, id: string | null) =>
      call('TaskCreate', { subject, activeForm: `Doing ${subject}` }, { taskId: id });

    it('adds each task pending, and moves it by its id — S-85, S-87', () => {
      expect(
        shape([
          created('a', '1'),
          created('b', '2'),
          call('TaskUpdate', { taskId: '2', status: 'in_progress' }),
          call('TaskUpdate', { taskId: '2', status: 'completed', subject: 'b, done' }),
        ]),
      ).toEqual([
        ['a', 'pending', null],
        ['b, done', 'completed', 'inProgress'],
      ]);
    });

    it('keeps a task whose creation has not ended, with no id yet', () => {
      const running = created('a', null);
      const [item] = taskListOf([{ ...running, status: 'running' }]).items;

      expect(item).toMatchObject({ id: null, key: running.toolUseId, state: 'pending' });
    });

    it('takes out a task updated to `deleted` — S-86', () => {
      expect(
        shape([created('a', '1'), call('TaskUpdate', { taskId: '1', status: 'deleted' })]),
      ).toEqual([]);
    });

    it('changes the title and what it is called while running, without a state', () => {
      const [item] = taskListOf([
        created('a', '1'),
        call('TaskUpdate', { taskId: '1', activeForm: 'Now doing a' }),
      ]).items;

      expect(item).toMatchObject({
        title: 'a',
        activeForm: 'Now doing a',
        state: 'pending',
        was: null,
      });
    });

    it.each([
      ['a task it does not have', { taskId: '9', status: 'completed' }],
      ['no task', { status: 'completed' }],
      ['a state it does not know', { taskId: '1', status: 'blocked' }],
    ])('reads nothing of an update of %s, and leaves it a tool — S-86', (_, input) => {
      const update = call('TaskUpdate', input);
      const list = taskListOf([created('a', '1'), update]);

      expect(list.items.map((item) => item.state)).toEqual(['pending']);
      expect(list.absorbed.has(update.toolUseId)).toBe(false);
    });

    it('reads nothing of a creation with no subject', () => {
      expect(taskListOf([call('TaskCreate', { description: 'x' })]).items).toEqual([]);
    });
  });

  it('reads the two forms in one conversation, in the order they came', () => {
    expect(
      shape([
        call('TaskCreate', { subject: 'a' }, { taskId: '1' }),
        call('TodoWrite', { todos: [todo('b', 'pending')] }),
      ]),
    ).toEqual([['b', 'pending', null]]);
  });

  it('counts no call that failed or was refused, nor one of a subagent', () => {
    const tools = [
      call('TodoWrite', { todos: [todo('a', 'pending')] }, { status: 'failed' }),
      call('TodoWrite', { todos: [todo('b', 'pending')] }, { status: 'denied' }),
      call('TodoWrite', { todos: [todo('c', 'pending')] }, { parentToolUseId: 'agent-1' }),
    ];

    expect(taskListOf(tools)).toEqual({ items: [], absorbed: new Set() });
  });

  it('knows the tools that change the list, and the ones that only read it', () => {
    expect(['TodoWrite', 'TaskCreate', 'TaskUpdate'].every(changesTaskList)).toBe(true);
    expect(['TaskGet', 'TaskList', 'Read'].some(changesTaskList)).toBe(false);
  });
});

import { asRecords } from '../../../../../support/builders/session.builder';
import { describe, expect, it } from 'vitest';
import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import {
  historicalEvents,
  SdkMessageMapper,
} from '@adapter/outbound/engines/claude/sdk-message.mapper';
import { TaskListTracker } from '@domain/session';
import { isSessionTasksChangedPayload } from '@remote-claude/contracts';
import { loadFixture } from '../../../../../fakes/agent-sdk/fixture';
import { capturedTranscript } from '../../../../../fakes/agent-sdk/scripted-transcripts';

/** The events of a recorded run, read the way the live stream reads them. */
function liveEvents(name: string) {
  const mapper = new SdkMessageMapper('');
  return loadFixture(name).messages.flatMap((message) => asRecords(mapper.read(message).events));
}

/** The engine's own name of a started call — opaque to every client, read here by its adapter. */
function nativeOf(payload: Record<string, unknown>): unknown {
  return (payload['origin'] as { native?: unknown } | undefined)?.native;
}

/** `[native, taskId]` for every tool of a run, the name from its start, the id from its end. */
function taskIdsOf(events: readonly { type: string; payload: Record<string, unknown> }[]) {
  const names = new Map(
    events
      .filter((event) => event.type === 'tool.started')
      .map((event) => [event.payload['toolUseId'], nativeOf(event.payload)]),
  );

  return events
    .filter((event) => event.type === 'tool.completed')
    .map((event) => [names.get(event.payload['toolUseId']), event.payload['taskId']]);
}

/** A `tool_result` read back from the transcript — which keeps no structured result. */
function resultEntry(content: unknown): SessionMessage {
  return {
    type: 'user',
    uuid: 'u-1',
    session_id: 's-1',
    parent_tool_use_id: null,
    parent_agent_id: null,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't-1', content }] },
  } as unknown as SessionMessage;
}

/** The task list in the stream — plan 08, B-20 and D-25. */
describe('the task of a list, on the end of its tool', () => {
  it('carries the id of every task the real run created or changed, and of nothing else — S-85', () => {
    expect(taskIdsOf(liveEvents('task-tools-turn'))).toEqual([
      ['ToolSearch', undefined],
      ['TaskCreate', '1'],
      ['TaskCreate', '2'],
      ['TaskCreate', '3'],
      ['TaskUpdate', '1'],
      ['Write', undefined],
      ['TaskUpdate', '1'],
    ]);
  });

  it('carries no id for a `TodoWrite`, whose list is whole in its input', () => {
    const events = liveEvents('todo-write-turn');

    expect(taskIdsOf(events).every(([, id]) => id === undefined)).toBe(true);
    expect(
      events.find((event) => event.type === 'tool.started' && event.payload['kind'] === 'tasks')
        ?.payload['rawInput'],
    ).toMatchObject({
      todos: [
        { content: 'Write a.txt', status: 'pending', activeForm: 'Writing a.txt' },
        { content: 'Write b.txt', status: 'pending' },
        { content: 'Write c.txt', status: 'pending' },
      ],
    });
  });

  it('reads the id of a new task from the history, which has only the text of the result — S-87', () => {
    const events = capturedTranscript('task-tools-turn').flatMap((message) =>
      asRecords(historicalEvents(message, '')),
    );

    // An update says its task in its input; only a creation needs the id from the result.
    expect(
      taskIdsOf(events)
        .filter(([name]) => name === 'TaskCreate')
        .map(([, id]) => id),
    ).toEqual(['1', '2', '3']);
  });

  it('reads the text of a result given as blocks, and takes nothing from any other text', () => {
    const [fromBlocks] = historicalEvents(
      resultEntry([{ type: 'text', text: 'Task #12 created successfully: Ship it' }]),
      '',
    );
    const [other] = historicalEvents(resultEntry('A task #3 created successfully, they said'), '');

    expect(fromBlocks?.payload).toMatchObject({ taskId: '12' });
    expect(other?.payload).not.toHaveProperty('taskId');
  });

  it('reads a message with two results by their text only, never by one structured result', () => {
    const [first, second] = new SdkMessageMapper('').read({
      type: 'user',
      uuid: 'u-2',
      session_id: 's-1',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'a', content: 'done' },
          { type: 'tool_result', tool_use_id: 'b', content: 'Task #4 created successfully: B' },
        ],
      },
      tool_use_result: { task: { id: '9' } },
    } as unknown as SDKMessage).events;

    expect(first?.payload).not.toHaveProperty('taskId');
    expect(second?.payload).toMatchObject({ taskId: '4' });
  });

  it('takes no id of a structured result that names none', () => {
    const [event] = new SdkMessageMapper('').read({
      type: 'user',
      uuid: 'u-3',
      session_id: 's-1',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'a', content: 'ok' }],
      },
      tool_use_result: { task: { id: 5 }, taskId: null },
    } as unknown as SDKMessage).events;

    expect(event?.payload).not.toHaveProperty('taskId');
  });

  it.each(['task-tools-turn', 'todo-write-turn', 'task-tools-listed-model-turn'])(
    'leaves nothing of the real run %s unmapped',
    (name) => {
      const mapper = new SdkMessageMapper('');
      const unknown = loadFixture(name)
        .messages.map((message) => mapper.read(message).unknown)
        .filter((variant) => variant !== null);

      expect(unknown).toEqual([]);
    },
  );
});

/** A call the model makes, as the live stream carries it. */
function call(
  id: string,
  name: string,
  input: Record<string, unknown>,
  parent: string | null = null,
): SDKMessage {
  return {
    type: 'assistant',
    uuid: `a-${id}`,
    session_id: 's-1',
    parent_tool_use_id: parent,
    message: { id: `m-${id}`, content: [{ type: 'tool_use', id, name, input }] },
  } as unknown as SDKMessage;
}

/** The end of a call, as the live stream carries it — with its structured result, when given. */
function end(
  id: string,
  options: { error?: boolean; parent?: string | null; result?: unknown; text?: string } = {},
): SDKMessage {
  return {
    type: 'user',
    uuid: `u-${id}`,
    session_id: 's-1',
    parent_tool_use_id: options.parent ?? null,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          content: options.text ?? 'ok',
          ...(options.error === true ? { is_error: true } : {}),
        },
      ],
    },
    ...(options.result === undefined ? {} : { tool_use_result: options.result }),
  } as unknown as SDKMessage;
}

/** The task lists a run of messages published, in order, through one mapper. */
function listsOf(mapper: SdkMessageMapper, ...messages: SDKMessage[]): unknown[] {
  return messages
    .flatMap((each) => asRecords(mapper.read(each).events))
    .filter((event) => event.type === 'session.tasksChanged')
    .map((event) => event.payload['tasks']);
}

const TODOS = {
  todos: [
    { content: 'Plan', status: 'completed', activeForm: 'Planning' },
    { content: 'Build', status: 'in_progress', activeForm: 'Building' },
    { content: 'Ship', status: 'pending' },
  ],
};

/** The agent's task list, as one event of its own — plan 28, B-22. */
describe('session.tasksChanged — S-66', () => {
  it('follows every list call of the real runs with the whole list, in canonical statuses', () => {
    const lists = (name: string) =>
      liveEvents(name)
        .filter((event) => event.type === 'session.tasksChanged')
        .map((event) => event.payload);

    const created = lists('task-tools-turn');
    const written = lists('todo-write-turn');

    expect(created).toHaveLength(5);
    expect(created.at(-1)).toEqual({
      tasks: [
        { id: '1', title: 'Write a.txt', activeTitle: 'Writing a.txt', status: 'completed' },
        { id: '2', title: 'Write b.txt', activeTitle: 'Writing b.txt', status: 'pending' },
        { id: '3', title: 'Write c.txt', activeTitle: 'Writing c.txt', status: 'pending' },
      ],
    });
    expect(written).toHaveLength(3);
    expect(written[1]?.['tasks']).toEqual([
      {
        id: 'Write a.txt',
        title: 'Write a.txt',
        activeTitle: 'Writing a.txt',
        status: 'inProgress',
      },
      {
        id: 'Write b.txt',
        title: 'Write b.txt',
        activeTitle: 'Writing b.txt',
        status: 'pending',
      },
      {
        id: 'Write c.txt',
        title: 'Write c.txt',
        activeTitle: 'Writing c.txt',
        status: 'pending',
      },
    ]);
    for (const payload of [...created, ...written]) {
      expect(isSessionTasksChangedPayload(payload)).toBe(true);
    }
  });

  it('comes right after the end of the call that changed the list, never before', () => {
    const mapper = new SdkMessageMapper('');
    mapper.read(call('t-1', 'TodoWrite', TODOS));

    expect(mapper.read(end('t-1')).events.map((event) => event.type)).toEqual([
      'tool.completed',
      'session.tasksChanged',
    ]);
  });

  it('reads a TodoWrite into the whole list, leaving out a title it has none of', () => {
    const mapper = new SdkMessageMapper('');

    expect(listsOf(mapper, call('t-1', 'TodoWrite', TODOS), end('t-1'))).toEqual([
      [
        { id: 'Plan', title: 'Plan', activeTitle: 'Planning', status: 'completed' },
        { id: 'Build', title: 'Build', activeTitle: 'Building', status: 'inProgress' },
        { id: 'Ship', title: 'Ship', status: 'pending' },
      ],
    ]);
  });

  it('creates, updates and deletes a task by the id the results give', () => {
    const mapper = new SdkMessageMapper('');

    const lists = listsOf(
      mapper,
      call('c-1', 'TaskCreate', { subject: 'Write a', activeForm: 'Writing a' }),
      end('c-1', { result: { task: { id: '7' } } }),
      call('c-2', 'TaskCreate', { subject: 'Write b' }),
      end('c-2', { text: 'Task #8 created successfully: Write b' }),
      call('u-1', 'TaskUpdate', { taskId: '7', status: 'in_progress', subject: 'Write A' }),
      end('u-1', { result: { taskId: '7' } }),
      call('d-1', 'TaskUpdate', { taskId: '8', status: 'deleted' }),
      end('d-1'),
    );

    expect(lists).toEqual([
      [{ id: '7', title: 'Write a', activeTitle: 'Writing a', status: 'pending' }],
      [
        { id: '7', title: 'Write a', activeTitle: 'Writing a', status: 'pending' },
        { id: '8', title: 'Write b', status: 'pending' },
      ],
      [
        { id: '7', title: 'Write A', activeTitle: 'Writing a', status: 'inProgress' },
        { id: '8', title: 'Write b', status: 'pending' },
      ],
      [{ id: '7', title: 'Write A', activeTitle: 'Writing a', status: 'inProgress' }],
    ]);
  });

  it('publishes nothing for a call that failed or was refused, and the list stays as it was', () => {
    const mapper = new SdkMessageMapper('');

    const lists = listsOf(
      mapper,
      call('t-1', 'TodoWrite', TODOS),
      end('t-1', { error: true }),
      call('c-1', 'TaskCreate', { subject: 'Only' }),
      end('c-1', { result: { task: { id: '1' } } }),
    );

    expect(lists).toEqual([[{ id: '1', title: 'Only', status: 'pending' }]]);
  });

  it("publishes nothing for a subagent's list, which is its own", () => {
    const mapper = new SdkMessageMapper('');

    expect(
      listsOf(
        mapper,
        call('t-1', 'TodoWrite', TODOS, 'agent-1'),
        end('t-1', { parent: 'agent-1' }),
        call('c-1', 'TaskCreate', { subject: 'Sub' }, 'agent-1'),
        end('c-1', { parent: 'agent-1', result: { task: { id: '1' } } }),
      ),
    ).toEqual([]);
  });

  it('publishes nothing for an update of a task the list does not have', () => {
    const mapper = new SdkMessageMapper('');

    expect(
      listsOf(
        mapper,
        call('u-1', 'TaskUpdate', { taskId: '99', status: 'completed' }),
        end('u-1', { result: { taskId: '99' } }),
      ),
    ).toEqual([]);
  });

  it('publishes nothing for a creation whose result names no id', () => {
    const mapper = new SdkMessageMapper('');

    expect(
      listsOf(mapper, call('c-1', 'TaskCreate', { subject: 'Lost' }), end('c-1', { text: 'ok' })),
    ).toEqual([]);
  });

  it('publishes nothing for a call it cannot read, nor for a call that does not change the list', () => {
    const mapper = new SdkMessageMapper('');

    expect(
      listsOf(
        mapper,
        call('t-1', 'TodoWrite', { todos: [{ content: 'No status' }] }),
        end('t-1'),
        call('u-1', 'TaskUpdate', { taskId: '1', status: 'blocked' }),
        end('u-1'),
        call('g-1', 'TaskGet', { taskId: '1' }),
        end('g-1'),
        call('b-1', 'Bash', { command: 'ls' }),
        end('b-1'),
        end('never-started'),
      ),
    ).toEqual([]);
  });

  it('dates the event read back from the history with the instant of its entry', () => {
    const tracker = new TaskListTracker();
    const started = {
      type: 'assistant',
      uuid: 'a-1',
      session_id: 's-1',
      parent_tool_use_id: null,
      timestamp: '2026-10-01T12:00:00.000Z',
      message: {
        id: 'm-1',
        content: [{ type: 'tool_use', id: 't-1', name: 'TodoWrite', input: TODOS }],
      },
    } as unknown as SessionMessage;
    const ended = {
      type: 'user',
      uuid: 'u-1',
      session_id: 's-1',
      parent_tool_use_id: null,
      timestamp: '2026-10-01T12:00:01.000Z',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't-1', content: 'ok' }],
      },
    } as unknown as SessionMessage;

    historicalEvents(started, '', tracker);
    const events = asRecords(historicalEvents(ended, '', tracker));

    expect(events.map((event) => event.type)).toEqual(['tool.completed', 'session.tasksChanged']);
    expect(events[1]?.payload).toMatchObject({ at: '2026-10-01T12:00:01.000Z' });
  });

  it('publishes nothing from a history read with no list to follow — a subagent page', () => {
    const events = capturedTranscript('todo-write-turn').flatMap((message) =>
      asRecords(historicalEvents(message, '')),
    );

    expect(events.some((event) => event.type === 'session.tasksChanged')).toBe(false);
  });
});

/** Replay and history repeat the list, never add to it — plan 28, S-67. */
describe('the task list read again — S-67', () => {
  it.each(['task-tools-turn', 'todo-write-turn'])(
    'reaches, from the history of %s, the same lists the live stream published',
    (name) => {
      const live = liveEvents(name).filter((event) => event.type === 'session.tasksChanged');
      const tracker = new TaskListTracker();
      const history = capturedTranscript(name)
        .flatMap((message) => asRecords(historicalEvents(message, '', tracker)))
        .filter((event) => event.type === 'session.tasksChanged');

      expect(history.map((event) => event.payload['tasks'])).toEqual(
        live.map((event) => event.payload['tasks']),
      );
    },
  );

  it('reads a history twice, each with its own list, to the same lists — never doubled', () => {
    const read = () => {
      const tracker = new TaskListTracker();
      return capturedTranscript('task-tools-turn')
        .flatMap((message) => asRecords(historicalEvents(message, '', tracker)))
        .filter((event) => event.type === 'session.tasksChanged')
        .map((event) => event.payload['tasks']);
    };

    const first = read();
    const second = read();

    expect(second).toEqual(first);
    expect((first.at(-1) as unknown[]).length).toBe(3);
  });
});

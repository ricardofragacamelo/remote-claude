import { describe, expect, it } from 'vitest';
import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import { historicalEvents, SdkMessageMapper } from '@adapter/outbound/claude/sdk-message.mapper';
import { loadFixture } from '../../../../fakes/agent-sdk/fixture';
import { capturedTranscript } from '../../../../fakes/agent-sdk/scripted-transcripts';

/** The events of a recorded run, read the way the live stream reads them. */
function liveEvents(name: string) {
  const mapper = new SdkMessageMapper();
  return loadFixture(name).messages.flatMap((message) => mapper.read(message).events);
}

/** `[toolName, taskId]` for every tool of a run, the name from its start, the id from its end. */
function taskIdsOf(events: readonly { type: string; payload: Record<string, unknown> }[]) {
  const names = new Map(
    events
      .filter((event) => event.type === 'tool.started')
      .map((event) => [event.payload['toolUseId'], event.payload['toolName']]),
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
      events.find(
        (event) => event.type === 'tool.started' && event.payload['toolName'] === 'TodoWrite',
      )?.payload['input'],
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
      historicalEvents(message),
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
    );
    const [other] = historicalEvents(resultEntry('A task #3 created successfully, they said'));

    expect(fromBlocks?.payload).toMatchObject({ taskId: '12' });
    expect(other?.payload).not.toHaveProperty('taskId');
  });

  it('reads a message with two results by their text only, never by one structured result', () => {
    const [first, second] = new SdkMessageMapper().read({
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
    const [event] = new SdkMessageMapper().read({
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
      const mapper = new SdkMessageMapper();
      const unknown = loadFixture(name)
        .messages.map((message) => mapper.read(message).unknown)
        .filter((variant) => variant !== null);

      expect(unknown).toEqual([]);
    },
  );
});

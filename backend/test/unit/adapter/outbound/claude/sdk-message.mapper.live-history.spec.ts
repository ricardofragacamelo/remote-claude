import { describe, expect, it } from 'vitest';
import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import {
  historicalEvents,
  SdkMessageMapper,
  summarise,
} from '@adapter/outbound/claude/sdk-message.mapper';
import { loadFixture } from '../../../../fakes/agent-sdk/fixture';
import { capturedTranscript } from '../../../../fakes/agent-sdk/scripted-transcripts';

/** A transcript entry of a given shape, cast once here rather than in every case. */
function entry(shape: Record<string, unknown>): SessionMessage {
  return {
    uuid: 'u-1',
    session_id: 's-1',
    parent_tool_use_id: null,
    parent_agent_id: null,
    ...shape,
  } as unknown as SessionMessage;
}

/** The live `assistant` and `user` messages of a recording, in order. */
function liveMessages(name: string): SDKMessage[] {
  return loadFixture(name).messages.filter(
    (message: SDKMessage) => message.type === 'assistant' || message.type === 'user',
  );
}

/** Every content block of the `message.completed` events of a list of events. */
function blocksOf(
  events: readonly { type: string; payload: Record<string, unknown> }[],
): unknown[] {
  return events
    .filter((event) => event.type === 'message.completed')
    .flatMap((event) => event.payload['content'] as unknown[]);
}

/** The payload of the first event of a type. */
function firstOf(
  events: readonly { type: string; payload: Record<string, unknown> }[],
  type: string,
): Record<string, unknown> | undefined {
  return events.find((event) => event.type === type)?.payload;
}

/** A tool result of the given content, read back from history. */
function resultOf(content: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const [event] = historicalEvents(
    entry({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't', content, ...extra }] },
    }),
  );

  return event?.payload ?? {};
}

describe('every block has an identity — plan 22, B-06', () => {
  it('names each block of a live message by its entry and its place — S-08', () => {
    const [thinking, text] = liveMessages('thinking-turn');
    const mapper = new SdkMessageMapper();

    expect(blocksOf(mapper.read(thinking as SDKMessage).events)).toEqual([
      { type: 'thinking', blockId: `${String(thinking?.uuid)}:0` },
    ]);
    expect(blocksOf(mapper.read(text as SDKMessage).events)).toEqual([
      expect.objectContaining({ type: 'text', blockId: `${String(text?.uuid)}:0` }),
    ]);
  });

  it('gives a block the same id live and read back, which a recording proves the uuid is — S-08, D-06', () => {
    const live = liveMessages('thinking-turn').flatMap((message) =>
      blocksOf(new SdkMessageMapper().read(message).events),
    );
    const history = capturedTranscript('thinking-turn').flatMap((message) =>
      blocksOf(historicalEvents(message)),
    );

    expect(history).toEqual(live);
    expect(new Set(history.map((block) => (block as { blockId: string }).blockId)).size).toBe(2);
  });

  it('tells apart the text and the image of one prompt — S-09', () => {
    const [event] = historicalEvents(
      entry({
        type: 'user',
        message: {
          content: [
            { type: 'text', text: 'what colour?' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          ],
        },
      }),
    );

    const ids = (event?.payload['content'] as { blockId: string }[]).map((block) => block.blockId);
    expect(ids).toEqual(['u-1:0', 'u-1:1']);
  });

  it('gives nothing an id when the SDK named no entry', () => {
    const mapped = new SdkMessageMapper().read({
      type: 'assistant',
      message: { id: 'm', content: [{ type: 'text', text: 'hi' }] },
    } as unknown as SDKMessage);

    expect(blocksOf(mapped.events)).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('gives the same ids to the same entry read twice — S-11', () => {
    const [message] = capturedTranscript('tool-turn');

    expect(historicalEvents(message as SessionMessage)).toEqual(
      historicalEvents(message as SessionMessage),
    );
  });
});

describe('the instant of an entry of the history — plan 22, B-06', () => {
  it('stamps every event of the entry with when it was written — S-10', () => {
    const events = historicalEvents(
      entry({
        type: 'assistant',
        timestamp: '2026-10-07T13:28:35.902Z',
        message: {
          id: 'msg_1',
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }],
        },
      }),
    );

    expect(events.map((event) => event.payload['at'])).toEqual([
      '2026-10-07T13:28:35.902Z',
      '2026-10-07T13:28:35.902Z',
    ]);
  });

  it('stamps a tool result too', () => {
    const [event] = historicalEvents(
      entry({
        type: 'user',
        timestamp: '2026-10-07T13:28:36.017Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
      }),
    );

    expect(event?.payload['at']).toBe('2026-10-07T13:28:36.017Z');
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['not text', 1_759_843_715_902],
  ])('leaves `at` out when the timestamp is %s, without breaking — S-10', (_, timestamp) => {
    const [event] = historicalEvents(
      entry({ type: 'user', timestamp, message: { content: 'continue' } }),
    );

    expect(event?.payload).not.toHaveProperty('at');
    expect(event?.payload['content']).toEqual([
      { type: 'text', blockId: 'u-1:0', text: 'continue' },
    ]);
  });

  it('never stamps a live event: the frame`s own instant is the clock', () => {
    const [tool] = liveMessages('bash-output-turn');

    for (const event of new SdkMessageMapper().read(tool as SDKMessage).events) {
      expect(event.payload).not.toHaveProperty('at');
    }
  });
});

describe('the title of a tool — plan 22, B-07', () => {
  it('is the description the model gave a Bash call, live and read back — S-12, S-07', () => {
    const [tool] = liveMessages('bash-output-turn');
    const [read] = capturedTranscript('bash-output-turn');

    const live = firstOf(new SdkMessageMapper().read(tool as SDKMessage).events, 'tool.started');
    const history = firstOf(historicalEvents(read as SessionMessage), 'tool.started');

    expect(live).toMatchObject({ toolName: 'Bash', title: 'Print numbers 1 through 600' });
    expect(history).toEqual(live);
  });

  it('is the description of any tool that brings one — S-12', () => {
    const [event, started] = historicalEvents(
      entry({
        type: 'assistant',
        message: {
          id: 'm',
          content: [
            {
              type: 'tool_use',
              id: 't',
              name: 'Agent',
              input: { description: '  Find the bug  ' },
            },
          ],
        },
      }),
    );

    expect(event?.type).toBe('message.completed');
    expect(started?.payload['title']).toBe('Find the bug');
  });

  it.each([
    ['absent', {}],
    ['empty', { description: '' }],
    ['only blank', { description: '  \n ' }],
    ['not text', { description: 42 }],
  ])('is left out when the description is %s — S-13', (_, input) => {
    const [, started] = historicalEvents(
      entry({
        type: 'assistant',
        message: { id: 'm', content: [{ type: 'tool_use', id: 't', name: 'Read', input }] },
      }),
    );

    expect(started?.payload).not.toHaveProperty('title');
  });
});

describe('the summary of a tool`s output — plan 22, B-08', () => {
  it('keeps the end of a long Bash output, recorded — S-15, S-07', () => {
    const results = capturedTranscript('bash-output-turn').flatMap((message) =>
      historicalEvents(message).filter((event) => event.type === 'tool.completed'),
    );

    expect(results[0]?.payload['summary']).toBe('…596\n597\n598\n599\n600');
  });

  it('reads a result made of blocks as their text, never as JSON — S-14', () => {
    const listed = capturedTranscript('task-subagent-turn')
      .flatMap((message) => historicalEvents(message))
      .filter(
        (event) =>
          event.type === 'tool.completed' && event.payload['parentToolUseId'] === undefined,
      )
      .map((event) => String(event.payload['summary']));

    expect(listed.length).toBeGreaterThan(0);
    for (const summary of listed) {
      expect(summary).not.toMatch(/^\[\{"type"/);
    }
    expect(
      resultOf([
        { type: 'text', text: 'one ' },
        { type: 'text', text: 'two' },
      ]),
    ).toMatchObject({
      summary: 'one two',
    });
  });

  it('reads a result that is a string as it is — S-14', () => {
    expect(resultOf('done')).toMatchObject({ summary: 'done' });
  });

  it.each([
    ['nothing', '', ''],
    ['one line', 'a', 'a'],
    ['five lines', '1\n2\n3\n4\n5', '1\n2\n3\n4\n5'],
    ['six lines', '1\n2\n3\n4\n5\n6', '…2\n3\n4\n5\n6'],
    ['five lines and a trailing newline', '1\n2\n3\n4\n5\n', '1\n2\n3\n4\n5'],
  ])('keeps the last 5 lines of %s — S-15', (_, output, expected) => {
    expect(summarise(output)).toBe(expected);
  });

  it.each([
    [399, false],
    [400, false],
    [401, true],
  ])('cuts at 400 characters: %i is cut — %s — S-15', (length, cut) => {
    const output = `${'a'.repeat(length - 1)}z`;
    const summary = summarise(output);

    expect(summary.startsWith('…')).toBe(cut);
    expect(summary.endsWith('z')).toBe(true);
    expect(summary.length).toBe(Math.min(length, 400) + (cut ? 1 : 0));
  });

  it('keeps the end of a single line longer than the ceiling — S-16', () => {
    const summary = summarise(`start${'x'.repeat(1_000)}end`);

    expect(summary.startsWith('…')).toBe(true);
    expect(summary.endsWith('xend')).toBe(true);
    expect(summary).not.toContain('start');
  });

  it('cuts a failed tool`s output the same way, and keeps it failed — S-17', () => {
    const payload = resultOf('1\n2\n3\n4\n5\n6', { is_error: true });

    expect(payload).toMatchObject({ status: 'failed', summary: '…2\n3\n4\n5\n6' });
  });
});

describe('the image of a prompt is a marker — plan 22, B-09', () => {
  it('carries its type and its decoded size, and never the bytes — S-18', () => {
    // 8 base64 characters with one `=` are 5 bytes.
    const [event] = historicalEvents(
      entry({
        type: 'user',
        message: {
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0=' },
            },
          ],
        },
      }),
    );

    expect(event?.payload['content']).toEqual([
      { type: 'image', blockId: 'u-1:0', mediaType: 'image/png', size: 5 },
    ]);
    expect(JSON.stringify(event)).not.toContain('iVBORw0');
  });

  it('carries no size for an image given by URL — S-19', () => {
    const [event] = historicalEvents(
      entry({
        type: 'user',
        message: {
          content: [
            {
              type: 'image',
              source: { type: 'url', media_type: 'image/png', url: 'https://x/y.png' },
            },
          ],
        },
      }),
    );

    expect(event?.payload['content']).toEqual([
      { type: 'image', blockId: 'u-1:0', mediaType: 'image/png' },
    ]);
  });

  it.each([
    ['no media type', { type: 'base64', data: 'AAAA' }, { size: 3 }],
    ['no source at all', undefined, {}],
  ])('still marks an image with %s — S-19', (_, source, fields) => {
    const [event] = historicalEvents(
      entry({ type: 'user', message: { content: [{ type: 'image', source }] } }),
    );

    expect(event?.payload['content']).toEqual([{ type: 'image', blockId: 'u-1:0', ...fields }]);
  });
});

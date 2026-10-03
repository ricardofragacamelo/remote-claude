import { describe, expect, it } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { SdkMessageMapper } from '@adapter/outbound/claude/sdk-message.mapper';
import { loadFixture } from '../../../../fakes/agent-sdk/fixture';

/** A message of a given shape, cast once here rather than in every case. */
function message(shape: Record<string, unknown>): SDKMessage {
  return shape as unknown as SDKMessage;
}

/** Maps one message with a mapper that has seen nothing else. */
function toEvents(shape: SDKMessage): ReturnType<SdkMessageMapper['read']> {
  return new SdkMessageMapper().read(shape);
}

/** The types the mapper produced for one message. */
function typesOf(shape: Record<string, unknown>): string[] {
  return toEvents(message(shape)).events.map((event: { type: string }) => event.type);
}

/** The message the fragments of a stream belong to, as `message_start` announces it. */
function messageStart(id: string): SDKMessage {
  return message({
    type: 'stream_event',
    uuid: `start-${id}`,
    event: { type: 'message_start', message: { id } },
  });
}

describe('the SDK message mapper', () => {
  describe('the table', () => {
    it('says nothing about `system:init`, whose session is not the one we opened', () => {
      // Our `session.started` is published when the session is opened, with our id and our
      // workspace. This message says the same things in the SDK's vocabulary and with the SDK's
      // own session id; publishing it would put a second `session.started` on the stream carrying
      // an id no client of ours can do anything with.
      const mapped = toEvents(
        message({
          type: 'system',
          subtype: 'init',
          session_id: 'sdk-1',
          cwd: '/srv/projects/app',
          model: 'claude-sonnet-5',
          permissionMode: 'default',
        }),
      );

      expect(mapped).toEqual({ events: [], unknown: null });
    });

    it('reads a text `stream_event` as a delta, grouped by message — S-24', () => {
      // The key is the id `message_start` announced, and never the envelope's own `uuid`: that one
      // is unique per fragment, and keying on it would make every fragment a message of its own.
      const mapper = new SdkMessageMapper();
      mapper.read(messageStart('msg_1'));

      const mapped = mapper.read(
        message({
          type: 'stream_event',
          uuid: 'u-1',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hel' } },
        }),
      );

      expect(mapped.events).toEqual([
        { type: 'message.delta', payload: { messageId: 'msg_1', delta: 'hel' } },
      ]);
    });

    it('groups every fragment of one message under the same id — S-24', () => {
      const mapper = new SdkMessageMapper();
      mapper.read(messageStart('msg_1'));

      const ids = ['hel', 'lo'].flatMap(
        (text) =>
          mapper.read(
            message({
              type: 'stream_event',
              uuid: `u-${text}`,
              event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
            }),
          ).events,
      );

      expect(ids).toEqual([
        { type: 'message.delta', payload: { messageId: 'msg_1', delta: 'hel' } },
        { type: 'message.delta', payload: { messageId: 'msg_1', delta: 'lo' } },
      ]);
    });

    it('drops a fragment of a message it never saw start', () => {
      // The stream was joined mid-message. Nothing is lost: `message.completed` carries the whole
      // message and supersedes whatever the deltas built.
      expect(
        toEvents(
          message({
            type: 'stream_event',
            uuid: 'u-1',
            event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hel' } },
          }),
        ).events,
      ).toEqual([]);
    });

    it('forgets the message once it stops, so the next one starts its own', () => {
      const mapper = new SdkMessageMapper();
      mapper.read(messageStart('msg_1'));
      mapper.read(
        message({ type: 'stream_event', uuid: 'u-stop', event: { type: 'message_stop' } }),
      );

      expect(
        mapper.read(
          message({
            type: 'stream_event',
            uuid: 'u-2',
            event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'orphan' } },
          }),
        ).events,
      ).toEqual([]);
    });

    it.each([
      ['a thinking delta', { type: 'content_block_delta', delta: { type: 'thinking_delta' } }],
      ['a block start', { type: 'content_block_start' }],
      ['a message stop', { type: 'message_stop' }],
    ])('emits nothing for %s', (_case, event) => {
      expect(typesOf({ type: 'stream_event', uuid: 'u-1', event })).toEqual([]);
    });

    it('reads an assistant message as a completed message', () => {
      expect(
        typesOf({
          type: 'assistant',
          message: { id: 'm-1', content: [{ type: 'text', text: 'hello' }] },
        }),
      ).toEqual(['message.completed']);
    });

    it('reads a `tool_use` block as a started tool as well — S-25', () => {
      const mapped = toEvents(
        message({
          type: 'assistant',
          message: {
            id: 'm-1',
            content: [
              { type: 'text', text: 'let me look' },
              { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/a' } },
            ],
          },
        }),
      );

      expect(mapped.events.map((event) => event.type)).toEqual([
        'message.completed',
        'tool.started',
      ]);
      expect(mapped.events[1]?.payload).toEqual({
        toolUseId: 'tu-1',
        toolName: 'Read',
        input: { file_path: '/a' },
      });
    });

    it('opens one tool per `tool_use` block, not one per message', () => {
      expect(
        typesOf({
          type: 'assistant',
          message: {
            id: 'm-1',
            content: [
              { type: 'tool_use', id: 'a', name: 'Read', input: {} },
              { type: 'tool_use', id: 'b', name: 'Bash', input: {} },
            ],
          },
        }),
      ).toEqual(['message.completed', 'tool.started', 'tool.started']);
    });

    it('reads a `tool_result` on a user message as a completed tool', () => {
      const mapped = toEvents(
        message({
          type: 'user',
          uuid: 'u-1',
          message: { content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' }] },
        }),
      );

      expect(mapped.events).toEqual([
        {
          type: 'tool.completed',
          payload: { toolUseId: 'tu-1', status: 'succeeded', summary: 'ok' },
        },
      ]);
    });

    it('reads a failed tool result as failed, which the UI shows differently', () => {
      const mapped = toEvents(
        message({
          type: 'user',
          uuid: 'u-1',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'no', is_error: true }],
          },
        }),
      );

      expect(mapped.events[0]?.payload).toMatchObject({ status: 'failed' });
    });

    it('reads a real user message as a completed message, so the other device is visible', () => {
      expect(
        typesOf({ type: 'user', uuid: 'u-1', message: { content: 'sent from a phone' } }),
      ).toEqual(['message.completed']);
    });

    it('reads `tool_progress` as progress', () => {
      const mapped = toEvents(
        message({
          type: 'tool_progress',
          tool_use_id: 'tu-1',
          tool_name: 'Bash',
          elapsed_time_seconds: 3,
        }),
      );

      expect(mapped.events[0]).toMatchObject({
        type: 'tool.progress',
        payload: { toolUseId: 'tu-1' },
      });
    });

    it('reads `result` as a completed turn, with usage, cost and duration — S-27', () => {
      const mapped = toEvents(
        message({
          type: 'result',
          subtype: 'success',
          uuid: 'r-1',
          duration_ms: 1234,
          total_cost_usd: 0.0123456,
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      );

      expect(mapped.events[0]?.payload).toEqual({
        turnId: 'r-1',
        usage: { input_tokens: 10, output_tokens: 20 },
        // A string and not a number: money through a float rounds where nobody looks.
        costUsd: '0.012346',
        durationMs: 1234,
      });
    });

    it('reads an API retry as a status change rather than an error', () => {
      expect(typesOf({ type: 'system', subtype: 'api_retry', attempt: 1 })).toEqual([
        'session.statusChanged',
      ]);
    });

    it('reads a compaction as an event of its own, with what triggered it — plan 08, B-02', () => {
      const mapped = toEvents(
        message({
          type: 'system',
          subtype: 'compact_boundary',
          compact_metadata: { trigger: 'manual', pre_tokens: 15212, post_tokens: 3021 },
        }),
      );

      expect(mapped.events).toEqual([
        { type: 'session.compacted', payload: { trigger: 'manual', preTokens: 15212 } },
      ]);
    });

    it.each([
      'thinking_tokens',
      'task_started',
      'task_progress',
      'task_updated',
      'task_notification',
      'background_tasks_changed',
    ])(
      'knows `system:%s` and draws nothing of it, without a warning — plan 08, discovery §10',
      (subtype) => {
        const mapped = toEvents(message({ type: 'system', subtype }));

        expect(mapped).toEqual({ events: [], unknown: null });
      },
    );

    it.each([
      ['a plain status message', { type: 'system', subtype: 'status', status: {} }],
      ['a rate limit', { type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }],
    ])('emits nothing for %s', (_case, shape) => {
      // A rate limit is a notice, not a transition. Publishing it as `idle` — which this used to
      // do — told a client the session had stopped while the model was mid-answer.
      expect(typesOf(shape)).toEqual([]);
    });
  });

  /** Plan 08, B-02 and B-19 — thinking, and the subagent an event belongs to. */
  describe('thinking and subagents', () => {
    const delta = (deltaShape: Record<string, unknown>, parent: string | null = null) =>
      message({
        type: 'stream_event',
        uuid: 'u',
        parent_tool_use_id: parent,
        event: { type: 'content_block_delta', index: 0, delta: deltaShape },
      });

    it('streams thinking as fragments of its own kind, and text as it always was', () => {
      const mapper = new SdkMessageMapper();
      mapper.read(messageStart('msg-1'));

      expect(mapper.read(delta({ type: 'thinking_delta', thinking: 'Adding' })).events).toEqual([
        {
          type: 'message.delta',
          payload: { messageId: 'msg-1', delta: 'Adding', blockType: 'thinking' },
        },
      ]);
      expect(mapper.read(delta({ type: 'text_delta', text: '17:22' })).events).toEqual([
        { type: 'message.delta', payload: { messageId: 'msg-1', delta: '17:22' } },
      ]);
    });

    it('sends no fragment for an empty thinking, a signature or a tool input being typed', () => {
      const mapper = new SdkMessageMapper();
      mapper.read(messageStart('msg-1'));

      for (const shape of [
        { type: 'thinking_delta', thinking: '' },
        { type: 'signature_delta', signature: 'abc' },
        { type: 'input_json_delta', partial_json: '{"a"' },
      ]) {
        expect(mapper.read(delta(shape)).events).toEqual([]);
      }
    });

    it('carries the thinking of a finished message in a field of its own, never in text', () => {
      const mapped = toEvents(
        message({
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [
              { type: 'thinking', thinking: 'Adding 14:35 and 2:47', signature: 'secret' },
              { type: 'thinking', thinking: '', signature: 'omitted' },
              { type: 'redacted_thinking', data: 'opaque' },
            ],
          },
        }),
      );

      expect(mapped.events[0]?.payload['content']).toEqual([
        { type: 'thinking', thinking: 'Adding 14:35 and 2:47' },
        { type: 'thinking' },
        { type: 'redacted_thinking' },
      ]);
    });

    it('names the tool that opened a subagent on everything of it — D-15', () => {
      const parent = 'toolu_task';
      const assistant = toEvents(
        message({
          type: 'assistant',
          parent_tool_use_id: parent,
          message: { id: 'm', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] },
        }),
      );
      const user = toEvents(
        message({
          type: 'user',
          uuid: 'u1',
          parent_tool_use_id: parent,
          message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }] },
        }),
      );
      const progress = toEvents(
        message({
          type: 'tool_progress',
          tool_use_id: 't1',
          tool_name: 'Read',
          parent_tool_use_id: parent,
          elapsed_time_seconds: 1,
        }),
      );
      const fragment = new SdkMessageMapper();
      fragment.read(messageStart('m'));

      for (const event of [
        ...assistant.events,
        ...user.events,
        ...progress.events,
        ...fragment.read(delta({ type: 'text_delta', text: 'hi' }, parent)).events,
      ]) {
        expect(event.payload['parentToolUseId'], event.type).toBe(parent);
      }
    });

    it('leaves the field out on the main conversation, as the contract had it', () => {
      const mapped = toEvents(
        message({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm', content: [] } }),
      );

      expect(Object.keys(mapped.events[0]?.payload ?? {})).not.toContain('parentToolUseId');
    });
  });

  describe('the shapes the SDK is loose about', () => {
    it('reads assistant content given as a string, not only as blocks', () => {
      const mapped = toEvents(
        message({ type: 'assistant', message: { id: 'm-1', content: 'hi' } }),
      );

      expect(mapped.events[0]?.payload).toMatchObject({
        content: [{ type: 'text', text: 'hi' }],
      });
    });

    it('reads a tool use with no id and no name without inventing either', () => {
      const mapped = toEvents(
        message({ type: 'assistant', message: { id: 'm-1', content: [{ type: 'tool_use' }] } }),
      );

      expect(mapped.events[1]?.payload).toEqual({ toolUseId: '', toolName: '', input: {} });
    });

    it('reads a tool use whose input is not an object as no input at all', () => {
      const mapped = toEvents(
        message({
          type: 'assistant',
          message: {
            id: 'm-1',
            content: [{ type: 'tool_use', id: 'a', name: 'X', input: 'oops' }],
          },
        }),
      );

      expect(mapped.events[1]?.payload).toMatchObject({ input: {} });
    });

    it('carries the id of a block the contract names `toolUseId`', () => {
      const mapped = toEvents(
        message({
          type: 'assistant',
          message: { id: 'm-1', content: [{ type: 'tool_use', id: 'tu-9', name: 'Read' }] },
        }),
      );

      expect(mapped.events[0]?.payload).toMatchObject({
        content: [{ type: 'tool_use', toolUseId: 'tu-9' }],
      });
    });

    it('reads content that is neither a string nor an array as no content', () => {
      const mapped = toEvents(message({ type: 'assistant', message: { id: 'm-1', content: 42 } }));

      expect(mapped.events[0]?.payload).toMatchObject({ content: [] });
    });

    it('drops a content entry that is not an object', () => {
      const mapped = toEvents(
        message({
          type: 'assistant',
          message: { id: 'm-1', content: ['loose', { type: 'text' }] },
        }),
      );

      expect((mapped.events[0]?.payload as { content: unknown[] }).content).toHaveLength(1);
    });

    it('reads a block with no type as `unknown` rather than dropping it', () => {
      const mapped = toEvents(
        message({ type: 'assistant', message: { id: 'm-1', content: [{ text: 'hi' }] } }),
      );

      expect(mapped.events[0]?.payload).toMatchObject({ content: [{ type: 'unknown' }] });
    });

    it('reads a user message with no uuid without failing', () => {
      const mapped = toEvents(message({ type: 'user', message: { content: 'hello' } }));

      expect(mapped.events[0]?.payload).toMatchObject({ messageId: '', role: 'user' });
    });

    it('reads a tool result with no id, and one whose content is structured', () => {
      const mapped = toEvents(
        message({
          type: 'user',
          uuid: 'u-1',
          message: { content: [{ type: 'tool_result', content: { lines: 3 } }] },
        }),
      );

      expect(mapped.events[0]?.payload).toEqual({
        toolUseId: '',
        status: 'succeeded',
        summary: '{"lines":3}',
      });
    });

    it('truncates a huge tool result rather than putting a file on the wire', () => {
      // A `Read` of a large file would otherwise land in the event stream, in the replay buffer
      // and in everybody's browser.
      const mapped = toEvents(
        message({
          type: 'user',
          uuid: 'u-1',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'a', content: 'x'.repeat(5_000) }],
          },
        }),
      );

      const summary = String((mapped.events[0]?.payload as { summary: string }).summary);
      expect(summary).toHaveLength(201);
      expect(summary.endsWith('…')).toBe(true);
    });

    it('reads a tool result with no content at all', () => {
      const mapped = toEvents(
        message({
          type: 'user',
          uuid: 'u-1',
          message: { content: [{ type: 'tool_result', tool_use_id: 'a' }] },
        }),
      );

      expect(mapped.events[0]?.payload).toMatchObject({ summary: '""' });
    });

    it('reads a result whose usage the SDK did not send', () => {
      const mapped = toEvents(
        message({
          type: 'result',
          subtype: 'success',
          uuid: 'r-1',
          duration_ms: 1,
          total_cost_usd: 0,
        }),
      );

      expect(mapped.events[0]?.payload).toMatchObject({ usage: {}, costUsd: '0.000000' });
    });
  });

  describe('the survival rule — S-26', () => {
    it('drops a variant it does not know instead of throwing', () => {
      const mapped = toEvents(message({ type: 'something_new_in_0_4', session_id: 's' }));

      expect(mapped.events).toEqual([]);
      expect(mapped.unknown).toBe('something_new_in_0_4');
    });

    it('knows the lifecycle the CLI answers a prompt streamed with a uuid, and says nothing of it', () => {
      const lifecycle = loadFixture('stamped-turn').messages.filter(
        (each) => (each as { type: string }).type === 'command_lifecycle',
      );

      expect(lifecycle.length).toBeGreaterThan(0);
      for (const each of lifecycle) {
        expect(toEvents(each)).toEqual({ events: [], unknown: null });
      }
    });

    it('maps every message of a turn whose prompt was streamed with a uuid', () => {
      const mapper = new SdkMessageMapper();

      for (const each of loadFixture('stamped-turn').messages) {
        expect(mapper.read(each).unknown).toBeNull();
      }
    });

    it('drops a `system` subtype it does not know, and names it', () => {
      const mapped = toEvents(message({ type: 'system', subtype: 'brand_new' }));

      expect(mapped.events).toEqual([]);
      expect(mapped.unknown).toBe('system:brand_new');
    });

    it('never puts the payload in the name, because a payload can be a file', () => {
      const mapped = toEvents(
        message({ type: 'unknown_kind', secret: 'the contents of somebody file' }),
      );

      expect(mapped.unknown).not.toContain('contents');
    });

    it('survives a message that is not even an object', () => {
      expect(toEvents('nonsense' as unknown as SDKMessage).unknown).toBe('not an object');
    });

    it('survives a message with no type at all', () => {
      expect(toEvents({ session_id: 's' } as unknown as SDKMessage).unknown).toBe('absent');
    });
  });

  describe('against what the real SDK sent', () => {
    it.each(['text-turn', 'tool-turn'])('maps every message of %s without throwing', (name) => {
      const fixture = loadFixture(name);

      for (const recorded of fixture.messages) {
        expect(() => toEvents(recorded)).not.toThrow();
      }
    });

    it('produces the timeline of a plain turn', () => {
      const mapper = new SdkMessageMapper();
      const types = loadFixture('text-turn').messages.flatMap((m) =>
        mapper.read(m).events.map((event) => event.type),
      );

      // Not `session.started`: that one is ours and is published when the session is opened. What
      // the recorded stream produces is the answer and the turn it belongs to.
      expect(types).toContain('message.delta');
      expect(types.at(-1)).toBe('turn.completed');
    });

    it('groups every fragment of a real recorded answer under one message', () => {
      // The rule the whole client store rests on, proved against a stream nobody wrote from
      // memory: the fragments of one answer carry one id, and it is the id the finished message
      // carries too.
      const mapper = new SdkMessageMapper();
      const events = loadFixture('text-turn').messages.flatMap((m) => mapper.read(m).events);

      const deltas = events
        .filter((event) => event.type === 'message.delta')
        .map((event) => event.payload['messageId']);
      const completed = events
        .filter((event) => event.type === 'message.completed')
        .map((event) => event.payload['messageId']);

      expect(deltas.length).toBeGreaterThan(1);
      expect(new Set(deltas).size).toBe(1);
      expect(completed).toContain(deltas[0]);
    });

    it('produces a started and a completed tool for every tool the real run made', () => {
      const mapper = new SdkMessageMapper();
      const events = loadFixture('tool-turn').messages.flatMap((m) => mapper.read(m).events);
      const started = events.filter((event) => event.type === 'tool.started');
      const completed = events.filter((event) => event.type === 'tool.completed');

      expect(started.length).toBeGreaterThan(0);
      expect(completed).toHaveLength(started.length);
    });

    it.each([
      'tool-turn',
      'edit-turn',
      'thinking-turn',
      'thinking-summarized-turn',
      'task-subagent-turn',
      'compact-turn',
      'plan-turn',
      'long-tool-turn',
    ])('leaves nothing of the real run %s unmapped', (name) => {
      // If this fails after an SDK upgrade it is doing its job: something new appeared, and the
      // table has to learn about it. The session would have survived either way.
      const unknown = loadFixture(name)
        .messages.map((m) => toEvents(m).unknown)
        .filter((variant) => variant !== null);

      expect(unknown).toEqual([]);
    });

    it('streams the summarised thinking of a real run, and finishes it as a block — D-17', () => {
      const mapper = new SdkMessageMapper();
      const events = loadFixture('thinking-summarized-turn').messages.flatMap(
        (m) => mapper.read(m).events,
      );
      const thinking = events.filter((event) => event.payload['blockType'] === 'thinking');
      const blocks = events
        .filter((event) => event.type === 'message.completed')
        .flatMap((event) => event.payload['content'] as { type: string; thinking?: string }[]);

      expect(thinking.length).toBeGreaterThan(1);
      expect(blocks.find((block) => block.type === 'thinking')?.thinking).toMatch(/\w/);
    });

    it('nests what the subagent of a real run said under the tool that opened it — D-15', () => {
      const mapper = new SdkMessageMapper();
      const events = loadFixture('task-subagent-turn').messages.flatMap(
        (m) => mapper.read(m).events,
      );
      const agent = events.find(
        (event) => event.type === 'tool.started' && event.payload['toolName'] === 'Agent',
      );
      const nested = events.filter((event) => event.payload['parentToolUseId'] !== undefined);

      expect(nested.length).toBeGreaterThan(0);
      expect(new Set(nested.map((event) => event.payload['parentToolUseId']))).toEqual(
        new Set([agent?.payload['toolUseId']]),
      );
    });

    it('marks the compaction of a real `/compact`', () => {
      const mapper = new SdkMessageMapper();
      const types = loadFixture('compact-turn').messages.flatMap((m) =>
        mapper.read(m).events.map((event) => event.type),
      );

      expect(types).toContain('session.compacted');
    });

    it('never lets an `SDKMessage` through as an event payload', () => {
      // ADR-006: our protocol is ours. A raw SDK shape in a payload would publish somebody
      // else's pre-1.0 type as our contract.
      const events = loadFixture('tool-turn').messages.flatMap((m) => toEvents(m).events);

      for (const event of events) {
        expect(Object.keys(event.payload)).not.toContain('parent_tool_use_id');
        expect(Object.keys(event.payload)).not.toContain('session_id');
      }
    });
  });
});

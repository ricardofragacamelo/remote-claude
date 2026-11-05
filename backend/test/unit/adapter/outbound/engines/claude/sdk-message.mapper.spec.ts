import { payloadOf } from '../../../../../support/builders/session.builder';
import { describe, expect, it } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { SdkMessageMapper } from '@adapter/outbound/engines/claude/sdk-message.mapper';
import { isToolProgressPayload, isToolStartedPayload } from '@remote-claude/contracts';
import { loadFixture } from '../../../../../fakes/agent-sdk/fixture';

/** A message of a given shape, cast once here rather than in every case. */
function message(shape: Record<string, unknown>): SDKMessage {
  return shape as unknown as SDKMessage;
}

/** Maps one message with a mapper that has seen nothing else. */
function toEvents(shape: SDKMessage): ReturnType<SdkMessageMapper['read']> {
  return new SdkMessageMapper('').read(shape);
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
      const mapper = new SdkMessageMapper('');
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
      const mapper = new SdkMessageMapper('');
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
      const mapper = new SdkMessageMapper('');
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
      // The canonical call (plan 28, B-15): by its kind and label, the engine's name opaque in
      // `origin`, and the input whole and opaque in `rawInput` — never `toolName` nor `input`.
      expect(mapped.events[1]?.payload).toEqual({
        toolUseId: 'tu-1',
        kind: 'file.read',
        label: { messageKey: 'sessions.tool.fileRead', params: { path: '/a' } },
        subject: { paths: ['/a'] },
        changes: [],
        origin: { engine: 'claude', native: 'Read' },
        rawInput: { file_path: '/a' },
      });
    });

    it('writes the paths of a label relative to the folder of the session — plan 28, B-14', () => {
      const mapped = new SdkMessageMapper('/srv/projects/app').read(
        message({
          type: 'assistant',
          message: {
            id: 'm-1',
            content: [
              {
                type: 'tool_use',
                id: 'tu-1',
                name: 'Write',
                input: { file_path: '/srv/projects/app/src/a.ts', content: 'a\nb' },
              },
            ],
          },
        }),
      );

      expect(mapped.events[1]?.payload).toMatchObject({
        kind: 'file.write',
        label: { messageKey: 'sessions.tool.fileWrite', params: { path: 'src/a.ts', lines: 2 } },
        subject: { paths: ['/srv/projects/app/src/a.ts'] },
        // The change goes without its text: the diff comes from the route (plan 28, D-28).
        changes: [{ path: '/srv/projects/app/src/a.ts', op: 'write' }],
      });
    });

    it('emits what the generated guard of the contract accepts — plan 28, S-46', () => {
      const mapped = toEvents(
        message({
          type: 'assistant',
          message: {
            id: 'm-1',
            content: [
              {
                type: 'tool_use',
                id: 'a',
                name: 'Edit',
                input: { file_path: '/a', old_string: 'x' },
              },
              {
                type: 'tool_use',
                id: 'b',
                name: 'Bash',
                input: { command: 'ls', description: 'List' },
              },
              { type: 'tool_use', id: 'c', name: 'mcp__srv__get', input: { id: 1 } },
              { type: 'tool_use', id: 'd', name: 'SomethingNew', input: {} },
              { type: 'tool_use' },
            ],
          },
        }),
      );
      const started = mapped.events.filter((event) => event.type === 'tool.started');

      expect(started).toHaveLength(5);
      for (const event of started) {
        expect(isToolStartedPayload(event.payload), JSON.stringify(event.payload)).toBe(true);
        expect(Object.keys(event.payload)).not.toContain('toolName');
        expect(Object.keys(event.payload)).not.toContain('input');
      }
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

    describe('media in a tool_result — plan 27, B-14', () => {
      it('turns an image into an attachment with a three-level blockId, never its bytes — S-53', () => {
        const mapped = toEvents(
          message({
            type: 'user',
            uuid: 'u-1',
            message: {
              content: [
                { type: 'text', text: 'before' },
                {
                  type: 'tool_result',
                  tool_use_id: 'tu-1',
                  content: [
                    {
                      type: 'image',
                      source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
                    },
                  ],
                },
              ],
            },
          }),
        );

        expect(mapped.events[0]?.payload).toMatchObject({
          attachments: [{ kind: 'image', blockId: 'u-1:1:0', mediaType: 'image/png', size: 3 }],
        });
        expect(JSON.stringify(mapped.events[0]?.payload)).not.toContain('AAAA');
      });

      it('keeps the resource/resource_link text the CLI already flattens, with no attachment — S-54, S-55', () => {
        // Measured in F0 (B-01): the CLI always flattens MCP `resource`/`resource_link` content into
        // `text` blocks before this message is built — `[Resource …] …`, `[Resource link: …] …` — so
        // they never reach this mapper as their own block type. Text is enough for that pair.
        const mapped = toEvents(
          message({
            type: 'user',
            uuid: 'u-1',
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tu-1',
                  content: [
                    { type: 'text', text: '[Resource from fixture at fixture://note.txt] a note' },
                    { type: 'text', text: '[Resource link: linked.txt] fixture://linked.txt' },
                  ],
                },
              ],
            },
          }),
        );

        expect(mapped.events[0]?.payload).toMatchObject({
          summary:
            '[Resource from fixture at fixture://note.txt] a note[Resource link: linked.txt] fixture://linked.txt',
        });
        expect(mapped.events[0]?.payload).not.toHaveProperty('attachments');
      });

      it('an image without a declared mediaType still becomes an attachment — S-56', () => {
        const mapped = toEvents(
          message({
            type: 'user',
            uuid: 'u-1',
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tu-1',
                  content: [{ type: 'image', source: { type: 'base64', data: 'AAAA' } }],
                },
              ],
            },
          }),
        );

        expect(mapped.events[0]?.payload).toMatchObject({
          attachments: [{ kind: 'image', blockId: 'u-1:0:0', size: 3 }],
        });
      });

      it('a block type this adapter does not know becomes `unknown`, with a warn signal — S-57', () => {
        const mapped = toEvents(
          message({
            type: 'user',
            uuid: 'u-1',
            message: {
              content: [
                { type: 'tool_result', tool_use_id: 'tu-1', content: [{ type: 'search_result' }] },
              ],
            },
          }),
        );

        expect(mapped.events[0]?.payload).toMatchObject({
          attachments: [{ kind: 'unknown', type: 'search_result' }],
        });
        expect(mapped.unknownAttachment).toBe('search_result');
      });

      it('a large image stays a small marker, never its base64 — S-58', () => {
        const huge = 'A'.repeat(5 * 1024 * 1024);
        const mapped = toEvents(
          message({
            type: 'user',
            uuid: 'u-1',
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tu-1',
                  content: [
                    {
                      type: 'image',
                      source: { type: 'base64', media_type: 'image/png', data: huge },
                    },
                  ],
                },
              ],
            },
          }),
        );

        expect(JSON.stringify(mapped.events[0]?.payload).length).toBeLessThan(200);
      });

      it('caps attachments at 16, the contract’s own ceiling', () => {
        const blocks = Array.from({ length: 20 }, () => ({ type: 'search_result' }));
        const mapped = toEvents(
          message({
            type: 'user',
            uuid: 'u-1',
            message: {
              content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: blocks }],
            },
          }),
        );

        const payload = mapped.events[0]?.payload as { attachments?: readonly unknown[] };
        expect(payload.attachments).toHaveLength(16);
      });
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

      // Only the elapsed time: the row's text is the label of the `tool.started` of the same id,
      // and the engine's name of the tool never travels on its own (plan 28, S-48).
      expect(mapped.events[0]).toEqual({
        type: 'tool.progress',
        payload: { toolUseId: 'tu-1', chunk: '3s' },
      });
      expect(JSON.stringify(mapped.events)).not.toContain('Bash');
      expect(isToolProgressPayload(mapped.events[0]?.payload)).toBe(true);
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

      // One event, never a `turn.failed` notice alongside: that one is only for an error outcome
      // (S-32).
      expect(mapped.events).toHaveLength(1);
      expect(mapped.events[0]?.payload).toEqual({
        turnId: 'r-1',
        usage: { inputTokens: 10, outputTokens: 20 },
        // A string and not a number: money through a float rounds where nobody looks.
        costUsd: '0.012346',
        durationMs: 1234,
        outcome: 'completed',
      });
    });

    it.each([
      ['error_max_turns', 'limitReached', 'maxTurns'],
      ['error_max_budget_usd', 'budgetExceeded', 'budget'],
      ['error_during_execution', 'failed', 'execution'],
      ['error_max_structured_output_retries', 'failed', 'other'],
      ['a subtype this build has never seen', 'failed', 'other'],
    ])(
      'reads a result of subtype %s as outcome %s, with a turn.failed notice (reason %s) alongside — S-32…S-34',
      (subtype, outcome, reason) => {
        const mapped = toEvents(
          message({
            type: 'result',
            subtype,
            uuid: 'r-1',
            duration_ms: 0,
            total_cost_usd: 0.05,
            usage: {},
            errors: ['boom'],
          }),
        );

        // The turn's own `outcome` never carries the SDK's subtype — only the three names the UI
        // knows, or `failed`. The subtype is opaque, and only `origin.native` of the *notice*
        // alongside it is allowed to carry it (diagnosis only; no client decides by it).
        expect(mapped.events[0]?.payload).toMatchObject({ outcome });
        expect(JSON.stringify(mapped.events[0])).not.toContain(subtype);

        expect(mapped.events[1]).toMatchObject({
          type: 'session.notice',
          payload: {
            noticeId: 'r-1',
            kind: 'turn.failed',
            level: 'error',
            params: { reason },
            text: 'boom',
          },
        });
      },
    );

    it("charges a turn only its own spend, never the whole conversation's running total — S-163, plan 16 D-02", () => {
      const mapper = new SdkMessageMapper('');

      const first = mapper.read(
        message({
          type: 'result',
          subtype: 'success',
          uuid: 'r-1',
          duration_ms: 1,
          total_cost_usd: 10.08,
          usage: {},
        }),
      );
      const second = mapper.read(
        message({
          type: 'result',
          subtype: 'success',
          uuid: 'r-2',
          duration_ms: 1,
          total_cost_usd: 10.1,
          usage: {},
        }),
      );

      expect(first.events[0]?.payload).toMatchObject({ costUsd: '10.080000' });
      expect(second.events[0]?.payload).toMatchObject({ costUsd: '0.020000' });
    });

    it('charges the whole figure when the running total dropped — a `/clear`, or a crash — rather than a negative turn', () => {
      const mapper = new SdkMessageMapper('');

      mapper.read(
        message({
          type: 'result',
          subtype: 'success',
          uuid: 'r-1',
          duration_ms: 1,
          total_cost_usd: 10.08,
          usage: {},
        }),
      );
      const after = mapper.read(
        message({
          type: 'result',
          subtype: 'error_during_execution',
          uuid: 'r-2',
          duration_ms: 0,
          total_cost_usd: 0,
          usage: {},
          errors: ['crashed'],
        }),
      );

      expect(after.events[0]?.payload).toMatchObject({ costUsd: '0.000000', outcome: 'failed' });
    });

    it('reads an API retry as a status change, with a request.retrying notice alongside — S-26', () => {
      const mapped = toEvents(
        message({
          type: 'system',
          subtype: 'api_retry',
          uuid: 'retry-1',
          attempt: 2,
          max_retries: 10,
          retry_delay_ms: 1090,
          error_status: null,
          error: 'unknown',
        }),
      );

      expect(mapped.events.map((event) => event.type)).toEqual([
        'session.statusChanged',
        'session.notice',
      ]);
      expect(mapped.events[0]?.payload).toEqual({ status: 'thinking' });
      expect(mapped.events[1]).toMatchObject({
        type: 'session.notice',
        payload: {
          noticeId: 'retry-1',
          kind: 'request.retrying',
          messageKey: 'sessions.notice.requestRetrying',
          params: { attempt: 2, maxAttempts: 10, delayMs: 1090 },
        },
      });
    });

    it('reads a compaction as an event of its own, with what triggered it — plan 08, B-02', () => {
      const mapped = toEvents(
        message({
          type: 'system',
          subtype: 'compact_boundary',
          uuid: 'cb-1',
          compact_metadata: { trigger: 'manual', pre_tokens: 15212, post_tokens: 3021 },
        }),
      );

      expect(mapped.events).toEqual([
        {
          type: 'session.compacted',
          // compactionId is the boundary's own uuid, stable live, in replay and read back from
          // history (plan 27, F5, B-18).
          payload: { trigger: 'manual', preTokens: 15212, compactionId: 'cb-1' },
        },
      ]);
    });

    it('reads the menu changing mid-session as the whole list, ordered and badged — found live, plan 28, B-46', () => {
      const mapped = toEvents(
        message({
          type: 'system',
          subtype: 'commands_changed',
          commands: [
            { name: 'help', description: 'Shows help', argumentHint: '', builtin: true },
            { name: 'deploy', description: 'Deploys the app', argumentHint: '[env]' },
          ],
        }),
      );

      expect(mapped.events).toEqual([
        {
          type: 'session.commandsChanged',
          payload: {
            commands: [
              {
                name: 'deploy',
                description: 'Deploys the app',
                argumentHint: '[env]',
                aliases: [],
                builtin: false,
                suggested: false,
                origin: 'project',
                label: 'deploy',
                shadowed: false,
              },
              {
                name: 'help',
                description: 'Shows help',
                argumentHint: '',
                aliases: [],
                builtin: true,
                suggested: false,
                origin: 'builtin',
                label: 'help',
                shadowed: false,
              },
            ],
          },
        },
      ]);
    });

    it('replaces the menu with an empty one rather than dropping the push — fronteira', () => {
      const mapped = toEvents(
        message({ type: 'system', subtype: 'commands_changed', commands: [] }),
      );

      expect(mapped.events).toEqual([
        { type: 'session.commandsChanged', payload: { commands: [] } },
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
      const mapper = new SdkMessageMapper('');
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
      const mapper = new SdkMessageMapper('');
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

      expect(payloadOf(mapped.events[0])['content']).toEqual([
        { type: 'thinking', thinking: 'Adding 14:35 and 2:47' },
        { type: 'thinking' },
        { type: 'redactedThinking' },
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
      const fragment = new SdkMessageMapper('');
      fragment.read(messageStart('m'));

      for (const event of [
        ...assistant.events,
        ...user.events,
        ...progress.events,
        ...fragment.read(delta({ type: 'text_delta', text: 'hi' }, parent)).events,
      ]) {
        expect(payloadOf(event)['parentToolUseId'], event.type).toBe(parent);
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

      // An empty name is no tool of Claude Code: the generic line, with nothing invented.
      expect(mapped.events[1]?.payload).toEqual({
        toolUseId: '',
        kind: 'other',
        label: { messageKey: 'sessions.tool.other', params: { name: '' } },
        subject: {},
        changes: [],
        origin: { engine: 'claude', native: '' },
        rawInput: {},
      });
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

      expect(mapped.events[1]?.payload).toMatchObject({ rawInput: {}, kind: 'other' });
    });

    it('carries the id of a block the contract names `toolUseId`', () => {
      const mapped = toEvents(
        message({
          type: 'assistant',
          message: { id: 'm-1', content: [{ type: 'tool_use', id: 'tu-9', name: 'Read' }] },
        }),
      );

      expect(mapped.events[0]?.payload).toMatchObject({
        content: [{ type: 'toolUse', toolUseId: 'tu-9' }],
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

      expect((payloadOf(mapped.events[0]) as { content: unknown[] }).content).toHaveLength(1);
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

    it('reads a tool result with no id, and one whose content is no text at all — plan 22, S-14', () => {
      const mapped = toEvents(
        message({
          type: 'user',
          uuid: 'u-1',
          message: { content: [{ type: 'tool_result', content: { lines: 3 } }] },
        }),
      );

      // Text or nothing: the JSON of a structure is what reached the screen until plan 22.
      expect(mapped.events[0]?.payload).toEqual({
        toolUseId: '',
        status: 'succeeded',
        summary: '',
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

      // Cut to the end, which is where an output says how it went (plan 22, D-07).
      const summary = String((mapped.events[0]?.payload as { summary: string }).summary);
      expect(summary).toHaveLength(401);
      expect(summary.startsWith('…')).toBe(true);
    });

    it('reads a tool result with no content at all', () => {
      const mapped = toEvents(
        message({
          type: 'user',
          uuid: 'u-1',
          message: { content: [{ type: 'tool_result', tool_use_id: 'a' }] },
        }),
      );

      expect(mapped.events[0]?.payload).toMatchObject({ summary: '' });
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
    it('drops a variant it does not know instead of throwing, and shows an `unknown` notice — B-13, S-48', () => {
      const mapped = toEvents(message({ type: 'something_new_in_0_4', session_id: 's' }));

      expect(mapped.events).toEqual([
        {
          type: 'session.notice',
          payload: {
            noticeId: 'unknown:s:0',
            kind: 'unknown',
            level: 'notice',
            origin: { engine: 'claude', native: 'something_new_in_0_4' },
          },
        },
      ]);
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
      const mapper = new SdkMessageMapper('');

      for (const each of loadFixture('stamped-turn').messages) {
        expect(mapper.read(each).unknown).toBeNull();
      }
    });

    it('drops a `system` subtype it does not know, names it, and shows an `unknown` notice — B-13, S-48', () => {
      const mapped = toEvents(message({ type: 'system', subtype: 'brand_new' }));

      expect(mapped.events).toEqual([
        {
          type: 'session.notice',
          payload: {
            noticeId: 'unknown:0',
            kind: 'unknown',
            level: 'notice',
            origin: { engine: 'claude', native: 'system:brand_new' },
          },
        },
      ]);
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
      const mapper = new SdkMessageMapper('');
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
      const mapper = new SdkMessageMapper('');
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
      const mapper = new SdkMessageMapper('');
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
      'compact-failed-turn',
      'local-command-turn',
      'project-command-turn',
      'hook-message-turn',
      'mcp-media-result-turn',
      'denied-by-rule-turn',
      'user-skill-plugin-turn',
    ])('leaves nothing of the real run %s unmapped', (name) => {
      // If this fails after an SDK upgrade it is doing its job: something new appeared, and the
      // table has to learn about it. The session would have survived either way.
      const unknown = loadFixture(name)
        .messages.map((m) => toEvents(m).unknown)
        .filter((variant) => variant !== null);

      expect(unknown).toEqual([]);
    });

    it('turns the real MCP media result into an image attachment, and the tool-search result into unknown — plan 27, B-14', () => {
      const mapper = new SdkMessageMapper('');
      const completed = loadFixture('mcp-media-result-turn')
        .messages.flatMap((m) => mapper.read(m).events)
        .filter((event) => event.type === 'tool.completed');

      const attachments = completed.map(
        (event) => (event.payload as { attachments?: readonly unknown[] }).attachments,
      );

      // The deferred-tool search result: a `tool_reference` block, a type this adapter does not
      // know how to carry as media — it survives as `unknown`, never silently (D-03).
      expect(attachments[0]).toEqual([{ kind: 'unknown', type: 'tool_reference' }]);

      // The media tool's own result: the image becomes a marker with no bytes, and the resource/
      // resource_link text (already flattened by the CLI) is not an attachment at all.
      const [image] = attachments[1] ?? [];
      expect(image).toMatchObject({ kind: 'image', mediaType: 'image/png' });
      expect((image as { blockId: string }).blockId).toMatch(/^.+:0:0$/);
      expect(attachments[1]).toHaveLength(1);
    });

    it('streams the summarised thinking of a real run, and finishes it as a block — D-17', () => {
      const mapper = new SdkMessageMapper('');
      const events = loadFixture('thinking-summarized-turn').messages.flatMap(
        (m) => mapper.read(m).events,
      );
      const thinking = events.filter((event) => payloadOf(event)['blockType'] === 'thinking');
      const blocks = events
        .filter((event) => event.type === 'message.completed')
        .flatMap((event) => event.payload['content'] as { type: string; thinking?: string }[]);

      expect(thinking.length).toBeGreaterThan(1);
      expect(blocks.find((block) => block.type === 'thinking')?.thinking).toMatch(/\w/);
    });

    it('nests what the subagent of a real run said under the tool that opened it — D-15, S-65', () => {
      const mapper = new SdkMessageMapper('');
      const events = loadFixture('task-subagent-turn').messages.flatMap(
        (m) => mapper.read(m).events,
      );
      const agent = events.find(
        // By the kind, never by the engine's name of the tool (plan 28, B-15).
        (event) => event.type === 'tool.started' && event.payload.kind === 'agent',
      );
      const nested = events.filter((event) => payloadOf(event)['parentToolUseId'] !== undefined);

      expect(nested.length).toBeGreaterThan(0);
      expect(new Set(nested.map((event) => payloadOf(event)['parentToolUseId']))).toEqual(
        new Set([payloadOf(agent)['toolUseId']]),
      );
    });

    it.each(['Agent', 'Task'])(
      'opens a subagent by the kind `agent` whatever the engine calls it (%s), and nests by its id — S-65',
      (name) => {
        const mapper = new SdkMessageMapper('');
        const opened = mapper.read(
          message({
            type: 'assistant',
            parent_tool_use_id: null,
            message: {
              id: 'm-1',
              content: [{ type: 'tool_use', id: 'agent-1', name, input: { description: 'look' } }],
            },
          }),
        ).events;
        const inside = mapper.read(
          message({
            type: 'assistant',
            parent_tool_use_id: 'agent-1',
            message: {
              id: 'm-2',
              content: [{ type: 'tool_use', id: 'read-1', name: 'Read', input: {} }],
            },
          }),
        ).events;
        const agent = opened.find((event) => event.type === 'tool.started');
        const nested = inside.find((event) => event.type === 'tool.started');

        expect(payloadOf(agent)).toMatchObject({ toolUseId: 'agent-1', kind: 'agent' });
        expect(payloadOf(agent)).not.toHaveProperty('parentToolUseId');
        expect(payloadOf(nested)).toMatchObject({
          kind: 'file.read',
          parentToolUseId: 'agent-1',
        });
      },
    );

    it('marks the compaction of a real `/compact`', () => {
      const mapper = new SdkMessageMapper('');
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

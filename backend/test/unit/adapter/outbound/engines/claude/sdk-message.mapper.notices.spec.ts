import { describe, expect, it } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { SdkMessageMapper } from '@adapter/outbound/engines/claude/sdk-message.mapper';
import { loadFixture } from '../../../../../fakes/agent-sdk/fixture';
import { payloadOf } from '../../../../../support/builders/session.builder';

/** Plan 27, F3 — the warnings (B-09), the turn/denied tool (B-10), the synthetic message and the
 * echo (B-11), the model switch (B-12) and the unknown variant (B-13). Scenarios S-22…S-52. */

/** A message of a given shape, cast once here rather than in every case. */
function message(shape: Record<string, unknown>): SDKMessage {
  return shape as unknown as SDKMessage;
}

/** Maps one message with a mapper that has seen nothing else. */
function toEvents(shape: Record<string, unknown>): ReturnType<SdkMessageMapper['read']> {
  return new SdkMessageMapper('').read(message(shape));
}

describe('B-09 — the warnings', () => {
  it("system:local_command_output — command.output with the text (S-22); subject.command absent, since the SDK's own message carries no command name", () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'local_command_output',
      uuid: 'lco-1',
      content: 'Compacted ',
    });

    expect(mapped.events).toEqual([
      {
        type: 'session.notice',
        payload: {
          noticeId: 'lco-1',
          kind: 'command.output',
          level: 'info',
          origin: { engine: 'claude', native: 'system:local_command_output' },
          text: 'Compacted ',
        },
      },
    ]);
  });

  it.each([
    ['info', 'info'],
    ['notice', 'notice'],
    ['suggestion', 'warning'],
    ['warning', 'warning'],
  ])('informational level %s becomes agent.info level %s — S-23', (sdkLevel, ourLevel) => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'informational',
      uuid: 'info-1',
      content: 'a banner',
      level: sdkLevel,
    });

    expect(mapped.events[0]).toMatchObject({
      type: 'session.notice',
      payload: { kind: 'agent.info', level: ourLevel, text: 'a banner' },
    });
  });

  it('informational with prevent_continuation carries the parameter saying the continuation stopped — S-23', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'informational',
      uuid: 'info-2',
      content: 'a Stop hook blocked this',
      level: 'warning',
      prevent_continuation: true,
    });

    expect(mapped.events[0]?.payload).toMatchObject({ params: { preventContinuation: true } });
  });

  it('notification, worker_shutting_down, memory_recall and conversation_reset become their own kinds — S-24', () => {
    expect(
      toEvents({
        type: 'system',
        subtype: 'notification',
        uuid: 'n-1',
        text: 'hi',
        priority: 'low',
      }).events[0],
    ).toMatchObject({
      payload: { kind: 'agent.notification', level: 'notice', text: 'hi' },
    });
    expect(
      toEvents({
        type: 'system',
        subtype: 'notification',
        uuid: 'n-1b',
        text: 'urgent',
        priority: 'immediate',
      }).events[0],
    ).toMatchObject({ payload: { kind: 'agent.notification', level: 'warning' } });
    expect(
      toEvents({
        type: 'system',
        subtype: 'worker_shutting_down',
        uuid: 'w-1',
        reason: 'host_exit',
      }).events[0],
    ).toMatchObject({ payload: { kind: 'agent.stopping', params: { reason: 'host_exit' } } });
    expect(
      toEvents({
        type: 'system',
        subtype: 'memory_recall',
        uuid: 'm-1',
        mode: 'select',
        memories: [
          { path: '/a', scope: 'personal' },
          { path: '/b', scope: 'team' },
        ],
      }).events[0],
    ).toMatchObject({ payload: { kind: 'agent.info', params: { paths: ['/a', '/b'] } } });
    expect(
      toEvents({ type: 'conversation_reset', uuid: 'c-1', new_conversation_id: 'new-id' })
        .events[0],
    ).toMatchObject({
      payload: {
        kind: 'agent.info',
        messageKey: 'sessions.notice.conversationReset',
        params: { newConversationId: 'new-id' },
      },
    });
  });

  it('hook-message-turn: the failing hook becomes agent.info with the stderr cut; the one that succeeds raises nothing beyond its own informational — S-25', () => {
    const mapper = new SdkMessageMapper('');
    const events = loadFixture('hook-message-turn').messages.flatMap((m) => mapper.read(m).events);
    const notices = events.filter((event) => event.type === 'session.notice');

    // One from the successful hook's `informational` (B-01: the systemMessage never comes on
    // `hook_response`), and one from the failing hook's `hook_response` — never two for the
    // success path, since its own `hook_response` carries nothing to show.
    expect(notices).toHaveLength(2);
    expect(notices[0]?.payload).toMatchObject({
      kind: 'agent.info',
      text: 'PreToolUse:Bash says: the Bash hook ran',
    });
    expect(notices[1]?.payload).toMatchObject({
      kind: 'agent.info',
      text: 'hook failed on purpose\n',
      subject: { hook: 'PreToolUse:Write', trigger: 'PreToolUse' },
    });
  });

  it('a failing hook with no stderr falls back to its output — S-25', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'hook_response',
      uuid: 'hook-empty',
      hook_id: 'h-1',
      hook_name: 'PreToolUse:Write',
      hook_event: 'PreToolUse',
      output: 'the only thing the hook printed',
      stdout: '',
      stderr: '',
      outcome: 'error',
    });

    expect(mapped.events[0]?.payload).toMatchObject({ text: 'the only thing the hook printed' });
  });

  it('a failed plugin install with no name is just the error, with no prefix — S-29', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'plugin_install',
      uuid: 'p-3',
      status: 'failed',
      error: 'checksum mismatch',
    });

    expect(mapped.events[0]?.payload).toMatchObject({ text: 'checksum mismatch' });
  });

  it('a failed plugin install with no error text at all still raises agent.info, with empty text — S-29', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'plugin_install',
      uuid: 'p-4',
      status: 'failed',
    });

    expect(mapped.events[0]?.payload).toMatchObject({ kind: 'agent.info', text: '' });
  });

  it('a failed compaction with no compact_error still raises compaction.failed, with empty text — S-28', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'status',
      uuid: 's-3',
      status: 'idle',
      compact_result: 'failed',
    });

    expect(mapped.events[0]?.payload).toMatchObject({ kind: 'compaction.failed', text: '' });
  });

  it('api_retry keeps session.statusChanged `thinking` and adds request.retrying with the numbers — S-26', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'api_retry',
      uuid: 'r-1',
      attempt: 1,
      max_retries: 10,
      retry_delay_ms: 566,
      error_status: null,
      error: 'unknown',
    });

    expect(mapped.events.map((e) => e.type)).toEqual(['session.statusChanged', 'session.notice']);
    expect(mapped.events[1]?.payload).toMatchObject({
      kind: 'request.retrying',
      params: { attempt: 1, maxAttempts: 10, delayMs: 566 },
    });
  });

  it('rate_limit_event in the normal state is quiet; near the limit and at the limit it becomes usage.limited — S-27', () => {
    const normal = toEvents({
      type: 'rate_limit_event',
      uuid: 'rl-1',
      rate_limit_info: { status: 'allowed' },
    });
    expect(normal.events).toEqual([]);

    const warning = toEvents({
      type: 'rate_limit_event',
      uuid: 'rl-2',
      rate_limit_info: { status: 'allowed_warning', rateLimitType: 'five_hour' },
    });
    expect(warning.events[0]).toMatchObject({
      payload: {
        kind: 'usage.limited',
        level: 'notice',
        params: { status: 'allowed_warning', rateLimitType: 'five_hour' },
      },
    });

    const rejected = toEvents({
      type: 'rate_limit_event',
      uuid: 'rl-3',
      rate_limit_info: { status: 'rejected' },
    });
    expect(rejected.events[0]).toMatchObject({
      payload: { kind: 'usage.limited', level: 'warning' },
    });
  });

  it('compact-failed-turn: no compact_boundary and no status:failed are emitted in this capture, so a constructed compact_error proves compaction.failed; an ordinary status stays quiet — S-28', () => {
    const failed = toEvents({
      type: 'system',
      subtype: 'status',
      uuid: 's-1',
      status: 'idle',
      compact_result: 'failed',
      compact_error: 'nothing to compact',
    });
    expect(failed.events[0]).toMatchObject({
      payload: { kind: 'compaction.failed', text: 'nothing to compact' },
    });

    const ordinary = toEvents({ type: 'system', subtype: 'status', uuid: 's-2', status: 'idle' });
    expect(ordinary.events).toEqual([]);
  });

  it('plugin_install raises agent.info only when it failed; auth_status only when it carries an error — S-29', () => {
    const failed = toEvents({
      type: 'system',
      subtype: 'plugin_install',
      uuid: 'p-1',
      status: 'failed',
      name: 'fixture-plugin',
      error: 'checksum mismatch',
    });
    expect(failed.events[0]).toMatchObject({
      payload: { kind: 'agent.info', text: 'fixture-plugin: checksum mismatch' },
    });

    const installed = toEvents({
      type: 'system',
      subtype: 'plugin_install',
      uuid: 'p-2',
      status: 'installed',
    });
    expect(installed.events).toEqual([]);

    const authFailed = toEvents({
      type: 'auth_status',
      uuid: 'a-1',
      isAuthenticating: false,
      output: [],
      error: 'expired',
    });
    expect(authFailed.events[0]).toMatchObject({
      payload: { kind: 'auth.failed', level: 'error', text: 'expired' },
    });

    const authOk = toEvents({
      type: 'auth_status',
      uuid: 'a-2',
      isAuthenticating: false,
      output: [],
    });
    expect(authOk.events).toEqual([]);
  });

  it('a notice`s text is empty, one character, at the ceiling and one over it (truncated) — S-30', () => {
    const max = 4000;
    const empty = toEvents({
      type: 'system',
      subtype: 'local_command_output',
      uuid: 't-0',
      content: '',
    });
    expect(empty.events[0]?.payload).toMatchObject({ text: '' });
    expect(empty.events[0]?.payload).not.toHaveProperty('truncated');

    const one = toEvents({
      type: 'system',
      subtype: 'local_command_output',
      uuid: 't-1',
      content: 'x',
    });
    expect(one.events[0]?.payload).toMatchObject({ text: 'x' });

    const atCeiling = toEvents({
      type: 'system',
      subtype: 'local_command_output',
      uuid: 't-2',
      content: 'x'.repeat(max),
    });
    expect(atCeiling.events[0]?.payload).toMatchObject({ text: 'x'.repeat(max) });
    expect(atCeiling.events[0]?.payload).not.toHaveProperty('truncated');

    const overCeiling = toEvents({
      type: 'system',
      subtype: 'local_command_output',
      uuid: 't-3',
      content: 'x'.repeat(max + 1),
    });
    expect(overCeiling.events[0]?.payload).toMatchObject({
      text: 'x'.repeat(max),
      truncated: true,
    });
  });

  it('a notice from inside a subagent carries the parentToolUseId, when the message gives one — S-31', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'informational',
      uuid: 'sub-1',
      content: 'from a subagent',
      level: 'notice',
      parent_tool_use_id: 'agent-call-1',
    });

    expect(mapped.events[0]?.payload).toMatchObject({ parentToolUseId: 'agent-call-1' });
  });
});

describe('B-10 — the turn outcome and the tool the CLI denied', () => {
  it("denied-by-rule-turn: the tool closes with status 'denied' and the reason, never 'failed' — S-35", () => {
    const mapper = new SdkMessageMapper('');
    const events = loadFixture('denied-by-rule-turn').messages.flatMap(
      (m) => mapper.read(m).events,
    );
    const completed = events.filter((event) => event.type === 'tool.completed');

    expect(completed).toHaveLength(1);
    expect(completed[0]?.payload).toMatchObject({
      status: 'denied',
      summary: 'Permission to use Bash with command touch forbidden.txt has been denied.',
    });
  });

  it('a permission_denied before its tool_result and one read a second time for an unrelated id both correlate by tool_use_id — S-36', () => {
    const mapper = new SdkMessageMapper('');

    mapper.read(
      message({
        type: 'system',
        subtype: 'permission_denied',
        uuid: 'pd-1',
        tool_name: 'Bash',
        tool_use_id: 'tu-1',
        message: 'denied by rule',
      }),
    );
    const mapped = mapper.read(
      message({
        type: 'user',
        uuid: 'u-1',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', is_error: true, content: 'denied by rule' },
          ],
        },
      }),
    );

    expect(mapped.events[0]?.payload).toMatchObject({
      status: 'denied',
      summary: 'denied by rule',
    });

    // Consumed: an ordinary error for a *different* tool right after is not denied by the same entry.
    const ordinary = mapper.read(
      message({
        type: 'user',
        uuid: 'u-2',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-2', is_error: true, content: 'boom' }],
        },
      }),
    );
    expect(ordinary.events[0]?.payload).toMatchObject({ status: 'failed' });
  });
});

describe('B-11 — the synthetic message and the echo', () => {
  it('compact-turn: the resumé is message.completed with injected.kind contextSummary, never a plain prompt — S-37', () => {
    const mapper = new SdkMessageMapper('');
    const events = loadFixture('compact-turn').messages.flatMap((m) => mapper.read(m).events);
    const summary = events.find(
      (event) => event.type === 'message.completed' && 'injected' in event.payload,
    );

    expect(summary?.payload).toMatchObject({ role: 'user', injected: { kind: 'contextSummary' } });
  });

  it('compact-turn: the <local-command-stdout> echo becomes command.output, tag stripped — S-38', () => {
    const mapper = new SdkMessageMapper('');
    const events = loadFixture('compact-turn').messages.flatMap((m) => mapper.read(m).events);
    const echo = events.find(
      (event) => event.type === 'session.notice' && event.payload['kind'] === 'command.output',
    );

    expect(echo?.payload).toMatchObject({ text: 'Compacted ' });
    expect(JSON.stringify(echo)).not.toContain('<local-command-stdout>');
  });

  it('the echo and a local_command_output of the same output both reach the client — D-07, S-39', () => {
    const mapper = new SdkMessageMapper('');

    const fromSystemMessage = mapper.read(
      message({
        type: 'system',
        subtype: 'local_command_output',
        uuid: 'lco-9',
        content: 'Compacted ',
      }),
    );
    const fromEcho = mapper.read(
      message({
        type: 'user',
        uuid: 'echo-9',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: '<local-command-stdout>Compacted </local-command-stdout>',
        },
        isReplay: true,
      }),
    );

    expect(fromSystemMessage.events).toHaveLength(1);
    expect(fromEcho.events).toHaveLength(1);
    expect(fromSystemMessage.events[0]?.payload).toMatchObject({
      kind: 'command.output',
      text: 'Compacted ',
    });
    expect(fromEcho.events[0]?.payload).toMatchObject({
      kind: 'command.output',
      text: 'Compacted ',
    });
  });

  it('the echo alone (no local_command_output in the turn) still becomes the notice — S-40', () => {
    const mapped = new SdkMessageMapper('').read(
      message({
        type: 'user',
        uuid: 'echo-solo',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: '<local-command-stdout>only this</local-command-stdout>',
        },
        isReplay: true,
      }),
    );

    expect(mapped.events[0]).toMatchObject({
      type: 'session.notice',
      payload: { kind: 'command.output', text: 'only this' },
    });
  });

  it('user-skill-plugin-turn: the injected skill body carries injected.kind instructions, with the parentToolUseId of the Skill call — S-41', () => {
    const mapper = new SdkMessageMapper('');
    const events = loadFixture('user-skill-plugin-turn').messages.flatMap(
      (m) => mapper.read(m).events,
    );
    const injected = events.find(
      (event) =>
        event.type === 'message.completed' &&
        (event.payload as { injected?: { kind?: string } }).injected?.kind === 'instructions',
    );

    expect(injected?.payload).toMatchObject({
      injected: { kind: 'instructions', name: 'fixture-user-skills:fixture-fortune' },
      parentToolUseId: 'toolu_017uFmZqHoBYMCcnb4QDFMHh',
    });
  });

  it('project-command-turn: the stream carries no echo, prompt or command tag — nothing of §5 for the live path to strip — S-42', () => {
    const mapper = new SdkMessageMapper('');
    const events = loadFixture('project-command-turn').messages.flatMap(
      (m) => mapper.read(m).events,
    );
    const userCompleted = events.filter(
      (event) => event.type === 'message.completed' && event.payload['role'] === 'user',
    );

    // Measured, B-01/B-02: a project command has no echo at all live — the stream goes straight
    // from `system:init` to the assistant's answer. There is nothing here for B-11 to strip.
    expect(userCompleted).toEqual([]);
  });

  it('a prompt replayed from another device (isReplay, no tag) still reaches the client as the prompt — S-43', () => {
    const mapped = new SdkMessageMapper('').read(
      message({
        type: 'user',
        uuid: 'replay-1',
        parent_tool_use_id: null,
        message: { role: 'user', content: 'sent from the phone' },
        isReplay: true,
      }),
    );

    expect(mapped.events[0]).toMatchObject({
      type: 'message.completed',
      payload: { role: 'user', content: [{ type: 'text', text: 'sent from the phone' }] },
    });
    expect(mapped.events[0]?.payload).not.toHaveProperty('injected');
  });
});

describe('B-12 — the model switch', () => {
  it('refusal-fallback-turn: model.switched with from/to/reason refusal — never a message.retracted (D-06) — S-44', () => {
    const mapper = new SdkMessageMapper('');
    const events = loadFixture('refusal-fallback-turn').messages.flatMap(
      (m) => mapper.read(m).events,
    );
    const switched = events.find(
      (event) => event.type === 'session.notice' && event.payload['kind'] === 'model.switched',
    );

    expect(switched?.payload).toMatchObject({
      messageKey: 'sessions.notice.modelSwitched',
      params: { from: 'claude-opus-5-5', to: 'claude-sonnet-5-5', reason: 'refusal' },
    });
    // `message.retracted` is not a member of the contract's event union at all (D-06): this is a
    // compile-time fact, not just a runtime one — there is no `event.type` value to check against.
  });

  it('model_refusal_no_fallback becomes model.refused with the content — S-45', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'model_refusal_no_fallback',
      uuid: 'refuse-1',
      original_model: 'claude-opus-5-5',
      request_id: null,
      content: "I can't help with that.",
    });

    expect(mapped.events[0]).toMatchObject({
      type: 'session.notice',
      payload: { kind: 'model.refused', level: 'warning', text: "I can't help with that." },
    });
  });

  it('an empty retracted_message_uuids list is just the notice — there was never a message.retracted event to add (D-06) — S-46', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'model_refusal_fallback',
      uuid: 'switch-1',
      trigger: 'refusal',
      direction: 'retry',
      original_model: 'claude-opus-5-5',
      fallback_model: 'claude-sonnet-5-5',
      request_id: null,
      retracted_message_uuids: [],
    });

    expect(mapped.events).toEqual([
      {
        type: 'session.notice',
        payload: {
          noticeId: 'switch-1',
          kind: 'model.switched',
          level: 'warning',
          origin: { engine: 'claude', native: 'system:model_refusal_fallback' },
          messageKey: 'sessions.notice.modelSwitched',
          params: { from: 'claude-opus-5-5', to: 'claude-sonnet-5-5', reason: 'refusal' },
        },
      },
    ]);
  });

  it('the same refusal read twice (live, then on replay) gives the same noticeId and the same ids — S-47', () => {
    const shape = {
      type: 'system',
      subtype: 'model_refusal_fallback',
      uuid: 'switch-2',
      trigger: 'refusal',
      direction: 'retry',
      original_model: 'claude-opus-5-5',
      fallback_model: 'claude-sonnet-5-5',
      request_id: null,
    };

    const live = toEvents(shape);
    const replay = toEvents(shape);

    expect(live.events).toEqual(replay.events);
    expect(live.events[0]?.payload).toMatchObject({ noticeId: 'switch-2' });
  });
});

describe('B-13 — the unknown variant', () => {
  it("{ type: 'system', subtype: 'nunca_visto', content: 'x' } — unknown, origin.native system:nunca_visto, text x — S-48", () => {
    const mapped = toEvents({ type: 'system', subtype: 'nunca_visto', uuid: 'u-1', content: 'x' });

    expect(mapped.events[0]).toEqual({
      type: 'session.notice',
      payload: {
        noticeId: 'u-1',
        kind: 'unknown',
        level: 'notice',
        origin: { engine: 'claude', native: 'system:nunca_visto' },
        text: 'x',
      },
    });
    expect(mapped.unknown).toBe('system:nunca_visto');
  });

  it('an unknown variant with no known text field carries no text, and never the JSON of the object field it does have — S-49', () => {
    const mapped = toEvents({
      type: 'system',
      subtype: 'nunca_visto',
      uuid: 'u-2',
      content: { secret: 'file contents' },
    });

    expect(mapped.events[0]?.payload).not.toHaveProperty('text');
    expect(JSON.stringify(mapped.events)).not.toContain('secret');
  });

  it('an unknown top-level type gets the same unknown line — S-50', () => {
    const mapped = toEvents({ type: 'nunca_visto_no_topo', uuid: 'u-3', message: 'hello' });

    expect(mapped.events[0]).toMatchObject({
      payload: { kind: 'unknown', origin: { native: 'nunca_visto_no_topo' }, text: 'hello' },
    });
  });

  it('the warn the runner logs still names the variant, never the payload — S-51', () => {
    const mapped = toEvents({ type: 'system', subtype: 'nunca_visto', uuid: 'u-4', content: 'x' });

    // `mapped.unknown` is what `session-runner.ts`'s `onMessage` logs at `warn` — unchanged by B-13.
    expect(mapped.unknown).toBe('system:nunca_visto');
  });

  it('an unknown variant with no uuid gets a derived noticeId, the same again on the same input — S-52', () => {
    const shape = { type: 'system', subtype: 'nunca_visto', content: 'x' };

    const first = payloadOf(toEvents(shape).events[0]);
    const second = payloadOf(toEvents(shape).events[0]);

    expect(first['noticeId']).toBe(second['noticeId']);
    expect(typeof first['noticeId']).toBe('string');
  });
});

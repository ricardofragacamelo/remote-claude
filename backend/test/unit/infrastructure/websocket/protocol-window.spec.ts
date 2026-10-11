import { describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { fromConnection, toConnection } from '@infra/websocket/protocol-window';

const CONVERSATION = { engine: 'claude', id: '6b41b192-a41b-46c2-b8d7-5098d8c825be' };
const SOURCE = { engine: 'claude', id: '0f0e0d0c-0b0a-4908-8706-050403020100' };

/** A frame of the current protocol. */
function frameOf(type: string, payload: Record<string, unknown>, v = 2): Envelope {
  return { v, id: 'f1', kind: 'event', type, ts: '', seq: 1, payload } as Envelope;
}

describe('the window of the previous protocol — plan 28, D-08', () => {
  it('hands a connection of the current protocol the frame as it is — S-36', () => {
    const frame = frameOf('session.started', { conversation: CONVERSATION, engine: 'claude' });

    expect(toConnection(frame, 2)).toBe(frame);
  });

  it('gives a connection of the previous protocol the conversation as it knew it — S-36', () => {
    const frame = frameOf('session.started', {
      sessionId: 's1',
      engine: 'claude',
      conversation: CONVERSATION,
      resumedFrom: SOURCE,
      capabilities: { resume: true },
    });

    expect(toConnection(frame, 1)).toEqual({
      ...frame,
      v: 1,
      payload: { sessionId: 's1', claudeSessionId: CONVERSATION.id, resumedFrom: SOURCE.id },
    });
  });

  it('answers each of two connections of one session in its own version — S-37', () => {
    const frame = frameOf('session.attached', { sessionId: 's1', conversation: CONVERSATION });

    expect(toConnection(frame, 2).payload).toEqual({ sessionId: 's1', conversation: CONVERSATION });
    expect(toConnection(frame, 1).payload).toEqual({
      sessionId: 's1',
      claudeSessionId: CONVERSATION.id,
    });
  });

  it('leaves out of the previous shape what a stream without a conversation never had', () => {
    expect(toConnection(frameOf('session.attached', { sessionId: 'diag' }), 1).payload).toEqual({
      sessionId: 'diag',
    });
  });

  it.each([['transcript.following'], ['transcript.appended'], ['transcript.reset']])(
    'names the followed conversation of %s by its id, for the previous protocol',
    (type) => {
      expect(
        toConnection(frameOf(type, { followId: 't1', conversation: CONVERSATION }), 1).payload,
      ).toEqual({ followId: 't1', conversationId: CONVERSATION.id });
    },
  );

  it('stamps the version on a frame nothing changed in, and keeps its payload', () => {
    const frame = frameOf('message.delta', { text: 'hi' });

    expect(toConnection(frame, 1)).toEqual({ ...frame, v: 1 });
  });

  it('reads a start of the previous protocol as the current one — the only engine it knew', () => {
    expect(
      fromConnection(
        frameOf('session.start', { workspacePath: '/w', resumeSessionId: SOURCE.id }, 1),
      ).payload,
    ).toEqual({ workspacePath: '/w', resumeFrom: SOURCE });
    expect(fromConnection(frameOf('session.start', { workspacePath: '/w' }, 1)).payload).toEqual({
      workspacePath: '/w',
    });
  });

  it('reads a follow of the previous protocol as the current one', () => {
    expect(
      fromConnection(frameOf('transcript.follow', { conversationId: CONVERSATION.id }, 1)).payload,
    ).toEqual({ conversation: CONVERSATION });
    expect(fromConnection(frameOf('transcript.follow', {}, 1)).payload).toEqual({});
  });

  it('leaves alone a frame of the current protocol, and one the window does not translate', () => {
    const current = frameOf('session.start', { resumeSessionId: 'x' });
    const other = frameOf('diag.ping', { nonce: 'n' }, 1);

    expect(fromConnection(current)).toBe(current);
    expect(fromConnection(other)).toBe(other);
  });

  describe('a tool call, for the previous protocol — plan 28, B-15', () => {
    const CANONICAL = {
      toolUseId: 'toolu-1',
      kind: 'shell',
      label: { messageKey: 'sessions.tool.shell', params: { command: 'ls' } },
      subject: { command: 'ls' },
      changes: [],
      origin: { engine: 'claude', native: 'Bash' },
      rawInput: { command: 'ls', description: 'List' },
    };

    it('names a started call by the engine`s name and its raw input, without the canonical fields', () => {
      const frame = frameOf('tool.started', { ...CANONICAL, title: 'List', parentToolUseId: 'p' });

      expect(toConnection(frame, 1).payload).toEqual({
        toolUseId: 'toolu-1',
        toolName: 'Bash',
        input: { command: 'ls', description: 'List' },
        title: 'List',
        parentToolUseId: 'p',
      });
    });

    it('titles a request by the engine`s name, as the previous protocol keyed it', () => {
      const frame = frameOf('permission.requested', {
        requestId: 'r1',
        ...CANONICAL,
        title: 'permission.tool.shell',
        riskHint: 'read',
      });

      expect(toConnection(frame, 1).payload).toEqual({
        requestId: 'r1',
        toolUseId: 'toolu-1',
        toolName: 'Bash',
        input: { command: 'ls', description: 'List' },
        title: 'permission.tool.Bash',
        riskHint: 'read',
      });
    });

    it('drops the interaction a started call never carried before (B-21)', () => {
      const question = { kind: 'question', malformed: false, questions: [] };
      const frame = frameOf('tool.started', { ...CANONICAL, interaction: question });

      expect(toConnection(frame, 1).payload).not.toHaveProperty('interaction');
    });

    it('keeps the question of a request, and drops a plan the previous protocol told by name (B-20)', () => {
      const question = { kind: 'question', malformed: false, questions: [] };
      const plan = { kind: 'plan', markdown: '# Plan' };
      const asked = frameOf('permission.requested', {
        requestId: 'r1',
        ...CANONICAL,
        interaction: question,
      });
      const planned = frameOf('permission.requested', {
        requestId: 'r2',
        ...CANONICAL,
        interaction: plan,
      });

      expect(toConnection(asked, 1).payload).toMatchObject({ interaction: question });
      expect(toConnection(planned, 1).payload).not.toHaveProperty('interaction');
      expect(toConnection(planned, 2).payload).toMatchObject({ interaction: plan });
    });

    it('translates the calls inside an appended page of a history, and leaves the rest of it', () => {
      const completed = { type: 'tool.completed', payload: { toolUseId: 'toolu-1' } };
      const frame = frameOf('transcript.appended', {
        followId: 'f1',
        conversation: CONVERSATION,
        events: [{ type: 'tool.started', payload: CANONICAL }, completed, null, { type: 7 }],
      });

      expect(toConnection(frame, 1).payload).toEqual({
        followId: 'f1',
        conversationId: CONVERSATION.id,
        events: [
          {
            type: 'tool.started',
            payload: { toolUseId: 'toolu-1', toolName: 'Bash', input: CANONICAL.rawInput },
          },
          completed,
          null,
          { type: 7 },
        ],
      });
    });

    it('leaves alone a nested call with no payload to translate', () => {
      const bare = { type: 'tool.started' };
      const frame = frameOf('transcript.appended', { conversation: CONVERSATION, events: [bare] });

      expect(toConnection(frame, 1).payload).toEqual({
        conversationId: CONVERSATION.id,
        events: [bare],
      });
    });

    it('hands a connection of the current protocol every call as it is — canonical', () => {
      const started = frameOf('tool.started', CANONICAL);
      const appended = frameOf('transcript.appended', {
        conversation: CONVERSATION,
        events: [{ type: 'tool.started', payload: CANONICAL }],
      });

      expect(toConnection(started, 2)).toBe(started);
      expect(toConnection(appended, 2)).toBe(appended);
    });
  });

  describe('who changed a file, for the previous protocol — plan 28, B-25', () => {
    const CHANGED = {
      watchId: 'w1',
      seq: 3,
      changes: [
        { path: 'a.ts', kind: 'changed', origin: 'agent', engine: 'claude' },
        { path: 'b.ts', kind: 'created', origin: 'user' },
        { path: 'c.ts', kind: 'deleted', origin: 'external' },
      ],
    };

    it('names a write of the agent `claude`, the one engine it knew, without the engine — S-73', () => {
      expect(toConnection(frameOf('workspace.filesChanged', CHANGED), 1).payload).toEqual({
        watchId: 'w1',
        seq: 3,
        changes: [
          { path: 'a.ts', kind: 'changed', origin: 'claude' },
          { path: 'b.ts', kind: 'created', origin: 'user' },
          { path: 'c.ts', kind: 'deleted', origin: 'external' },
        ],
      });
    });

    it('hands the current protocol the agent and its engine as they are — S-73, S-74', () => {
      const frame = frameOf('workspace.filesChanged', CHANGED);

      expect(toConnection(frame, 2)).toBe(frame);
    });

    it('leaves alone a window with no list of changes', () => {
      expect(toConnection(frameOf('workspace.filesChanged', { watchId: 'w1' }), 1).payload).toEqual(
        { watchId: 'w1' },
      );
    });
  });

  describe('the modes, for the previous protocol — plan 28, S-77 / S-79', () => {
    it.each([
      ['ask', 'default'],
      ['readOnly', 'plan'],
      ['acceptEdits', 'acceptEdits'],
      ['allowAll', 'allowAll'],
    ])('names the mode %s of a session as %s', (mode, previous) => {
      for (const type of ['session.started', 'session.attached']) {
        const frame = frameOf(type, { sessionId: 's1', permissionMode: mode });

        expect(toConnection(frame, 1).payload).toEqual({
          sessionId: 's1',
          permissionMode: previous,
        });
        expect(toConnection(frame, 2).payload).toEqual({ sessionId: 's1', permissionMode: mode });
      }
    });

    it('leaves a session without a mode without one', () => {
      expect(toConnection(frameOf('session.started', { sessionId: 's1' }), 1).payload).toEqual({
        sessionId: 's1',
      });
    });

    it.each([
      ['default', 'ask'],
      ['plan', 'readOnly'],
      ['acceptEdits', 'acceptEdits'],
      ['allowAll', 'allowAll'],
      // Not a mode of either protocol: it goes on as it came, and the schema refuses it.
      ['bypassPermissions', 'bypassPermissions'],
      ['constructor', 'constructor'],
    ])('reads the mode %s a start of the previous protocol asks for as %s', (previous, mode) => {
      expect(
        fromConnection(
          frameOf('session.start', { workspacePath: '/w', permissionMode: previous }, 1),
        ).payload,
      ).toEqual({ workspacePath: '/w', permissionMode: mode });
    });

    it.each([
      ['default', 'ask'],
      ['plan', 'readOnly'],
      ['bypassPermissions', 'bypassPermissions'],
    ])('reads a switch of the previous protocol to %s as %s', (previous, mode) => {
      expect(
        fromConnection(frameOf('session.setPermissionMode', { sessionId: 's1', mode: previous }, 1))
          .payload,
      ).toEqual({ sessionId: 's1', mode });
    });

    it('leaves a mode that is not a string alone', () => {
      expect(
        fromConnection(frameOf('session.setPermissionMode', { sessionId: 's1', mode: 3 }, 1))
          .payload,
      ).toEqual({ sessionId: 's1', mode: 3 });
    });

    it('takes the old names from a connection of the previous protocol only', () => {
      const current = frameOf('session.start', { workspacePath: '/w', permissionMode: 'default' });

      expect(fromConnection(current)).toBe(current);
    });

    it('drops the read-only refusal the previous protocol had no name for', () => {
      const refused = frameOf('permission.resolved', {
        requestId: 'r1',
        decision: 'deny',
        auto: true,
        via: 'readOnly',
      });
      const ruled = frameOf('permission.resolved', {
        requestId: 'r2',
        decision: 'deny',
        via: 'rule',
      });

      expect(toConnection(refused, 1).payload).toEqual({
        requestId: 'r1',
        decision: 'deny',
        auto: true,
      });
      expect(toConnection(ruled, 1).payload).toEqual(ruled.payload);
      expect(toConnection(refused, 2).payload).toEqual(refused.payload);
    });
  });

  describe('the usage of a turn, for the previous protocol — plan 28, S-85', () => {
    it('names the counts as the Anthropic API did, and drops what it had no name for', () => {
      const frame = frameOf('turn.completed', {
        turnId: 't1',
        usage: {
          inputTokens: 1_200,
          outputTokens: 340,
          cacheReadTokens: 9_000,
          cacheWriteTokens: 512,
          webSearches: 3,
          reasoningTokens: 40,
        },
        costUsd: '0.010000',
        durationMs: 10,
      });

      expect(toConnection(frame, 1).payload).toEqual({
        turnId: 't1',
        usage: {
          input_tokens: 1_200,
          output_tokens: 340,
          cache_read_input_tokens: 9_000,
          cache_creation_input_tokens: 512,
        },
        costUsd: '0.010000',
        durationMs: 10,
      });
      expect(toConnection(frame, 2)).toBe(frame);
    });

    it('gives a turn without a usage an empty one', () => {
      expect(toConnection(frameOf('turn.completed', { turnId: 't1' }), 1).payload).toEqual({
        turnId: 't1',
        usage: {},
      });
    });
  });

  describe('the block kinds of a message, for the previous protocol — plan 28, S-88 / S-90', () => {
    it('names the kinds as the Anthropic API did, and leaves the others as they are', () => {
      const frame = frameOf('message.completed', {
        messageId: 'm1',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'thinking' },
          { type: 'redactedThinking' },
          { type: 'toolUse', toolUseId: 'a' },
          { type: 'toolResult', toolUseId: 'b' },
          { type: 'brandNew' },
          { type: 'constructor' },
        ],
      });

      expect(toConnection(frame, 1).payload).toEqual({
        messageId: 'm1',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'thinking' },
          { type: 'redacted_thinking' },
          { type: 'tool_use', toolUseId: 'a' },
          { type: 'tool_result', toolUseId: 'b' },
          { type: 'brandNew' },
          { type: 'constructor' },
        ],
      });
      expect(toConnection(frame, 2)).toBe(frame);
    });

    it('translates the blocks of a message inside an appended page of a history', () => {
      const frame = frameOf('transcript.appended', {
        conversation: CONVERSATION,
        events: [
          {
            type: 'message.completed',
            payload: { messageId: 'm1', content: [{ type: 'toolUse' }] },
          },
        ],
      });

      expect(toConnection(frame, 1).payload).toEqual({
        conversationId: CONVERSATION.id,
        events: [
          {
            type: 'message.completed',
            payload: { messageId: 'm1', content: [{ type: 'tool_use' }] },
          },
        ],
      });
    });

    it('leaves alone a message with no list of blocks', () => {
      expect(toConnection(frameOf('message.completed', { messageId: 'm1' }), 1).payload).toEqual({
        messageId: 'm1',
      });
    });
  });
});

import { describe, expect, it } from 'vitest';

import type { Envelope } from '@remote-claude/contracts';

import {
  closeSession,
  conversationFrom,
  readEvent,
  conversationOfStart,
  interruptSession,
  refusalOf,
  resumeAnswer,
  resumeSession,
  SILENT,
  withHistory,
  sendPrompt,
  setSessionModel,
  setSessionPermissionMode,
  startDraft,
  startedBy,
  forkConversation,
} from '@/features/session/services/live-session.service';
import type { WsClient } from '@/shared/api/ws-client';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const AT = '2026-09-19T12:00:00.000Z';

/** A client that records what was sent, instead of owning a socket. */
function aClient(ready = true) {
  const sent: { type: string; payload: Readonly<Record<string, unknown>> }[] = [];

  return {
    sent,
    client: {
      command: (type: string, payload: Readonly<Record<string, unknown>>) => {
        sent.push({ type, payload });
        return ready;
      },
      issue: (type: string, payload: Readonly<Record<string, unknown>>) => {
        sent.push({ type, payload });
        return ready ? 'cmd-1' : null;
      },
    } as unknown as WsClient,
  };
}

/**
 * The commands that drive a session.
 *
 * A service knows the command, its payload and how to read the answer — and nothing about React or
 * about when it should be called. That is the hook's decision.
 */
describe('the session commands', () => {
  it('opens the session of a draft with what was chosen, and answers its id — S-152', () => {
    const { client, sent } = aClient();

    expect(
      startDraft(client, {
        workspacePath: '/srv/projects/app',
        model: null,
        permissionMode: 'default',
        effort: null,
      }),
    ).toBe('cmd-1');
    startDraft(client, {
      workspacePath: '/srv/projects/app',
      model: 'opus',
      permissionMode: 'plan',
      effort: 'high',
    });

    expect(sent).toEqual([
      {
        type: 'session.start',
        payload: { workspacePath: '/srv/projects/app', permissionMode: 'default' },
      },
      {
        type: 'session.start',
        payload: {
          workspacePath: '/srv/projects/app',
          permissionMode: 'plan',
          model: 'opus',
          effort: 'high',
        },
      },
    ]);
  });

  it('forks a conversation up to before a prompt — never a truncation, D-19', () => {
    const { client, sent } = aClient();

    expect(forkConversation(client, '/srv/projects/app', 'conv-1', 'msg-3')).toBe('cmd-1');
    expect(sent).toEqual([
      {
        type: 'session.start',
        payload: { workspacePath: '/srv/projects/app', resumeSessionId: 'conv-1', forkAt: 'msg-3' },
      },
    ]);
  });

  it('reads the session a start of its own opened, and nothing else', () => {
    const started = {
      v: 1,
      id: 'evt-1',
      kind: 'event',
      type: 'session.started',
      ts: AT,
      correlationId: 'cmd-1',
      payload: { sessionId: SESSION },
    } as unknown as Envelope;

    expect(startedBy(started, 'cmd-1')).toBe(SESSION);
    expect(startedBy(started, 'cmd-2')).toBeNull();
    expect(startedBy({ ...started, type: 'session.attached' } as Envelope, 'cmd-1')).toBeNull();
  });

  it('sends a turn, and answers the id its refusal would name — S-34', () => {
    const { client, sent } = aClient();

    expect(sendPrompt(client, SESSION, 'do the work')).toBe('cmd-1');

    expect(sent[0]).toEqual({
      type: 'session.prompt',
      payload: { sessionId: SESSION, text: 'do the work' },
    });
  });

  it.each([
    ['session.interrupt', () => interruptSession],
    ['session.close', () => closeSession],
  ])('sends %s with nothing but the session', (type, of) => {
    const { client, sent } = aClient();

    of()(client, SESSION);

    expect(sent[0]).toEqual({ type, payload: { sessionId: SESSION } });
  });

  it('changes the model', () => {
    const { client, sent } = aClient();

    const commandId = setSessionModel(client, SESSION, 'claude-opus-5');

    expect(sent[0]?.payload).toEqual({ sessionId: SESSION, model: 'claude-opus-5' });
    // The id a refusal of it names — plan 09, S-23.
    expect(commandId).toBe('cmd-1');
  });

  it('changes the permission mode', () => {
    const { client, sent } = aClient();

    const commandId = setSessionPermissionMode(client, SESSION, 'acceptEdits');

    expect(sent[0]?.payload).toEqual({ sessionId: SESSION, mode: 'acceptEdits' });
    expect(commandId).toBe('cmd-1');
  });

  it('never pretends a command left while the socket is down', () => {
    const { client } = aClient(false);

    expect(sendPrompt(client, SESSION, 'hello')).toBeNull();
  });
});

describe('recognising the refusal of one command — plan 04, S-34', () => {
  const refusal: Envelope = {
    v: 1,
    id: 'srv-9',
    kind: 'error',
    type: 'error',
    ts: AT,
    correlationId: 'cmd-1',
    traceId: 'trace-1',
    payload: {
      code: 'INVALID_INPUT',
      messageKey: 'session.error.unknownCommand',
      params: { command: 'nope' },
    },
  };

  it('is the error that names the command, translated from its key and params', () => {
    expect(refusalOf(refusal, 'cmd-1')).toMatchObject({
      code: 'INVALID_INPUT',
      messageKey: 'session.error.unknownCommand',
      params: { command: 'nope' },
      traceId: 'trace-1',
    });
  });

  it('is nothing for another command, nor for a frame that is not an error', () => {
    expect(refusalOf(refusal, 'cmd-2')).toBeNull();
    expect(refusalOf({ ...refusal, kind: 'ack', type: 'command.accepted' }, 'cmd-1')).toBeNull();
  });
});

describe('continuing a conversation — plan 04, F2', () => {
  const CONVERSATION = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
  const FORK = '00000000-0000-4000-8000-000000000001';

  function frame(overrides: Partial<Envelope>): Envelope {
    return { v: 1, id: 'f1', kind: 'event', type: 'session.started', ts: AT, ...overrides };
  }

  it('asks for the conversation in the workspace it ran in, and answers the command id', () => {
    const sent: { type: string; payload: unknown }[] = [];
    const client = {
      issue: (type: string, payload: unknown) => {
        sent.push({ type, payload });
        return 'cmd-1';
      },
    } as unknown as WsClient;

    expect(resumeSession(client, '/srv/projects/app', CONVERSATION)).toBe('cmd-1');
    expect(sent).toEqual([
      {
        type: 'session.start',
        payload: { workspacePath: '/srv/projects/app', resumeSessionId: CONVERSATION },
      },
    ]);
  });

  describe('recognising the answer', () => {
    const request = { conversationId: CONVERSATION, commandId: 'cmd-1' };

    it('is a session that started and continues it — in place or as a fork', () => {
      expect(
        resumeAnswer(
          frame({
            payload: {
              sessionId: SESSION,
              claudeSessionId: CONVERSATION,
              resumedFrom: CONVERSATION,
            },
          }),
          request,
        ),
      ).toEqual({ kind: 'resumed', sessionId: SESSION });
      expect(
        resumeAnswer(
          frame({
            payload: { sessionId: SESSION, claudeSessionId: FORK, resumedFrom: CONVERSATION },
          }),
          request,
        ),
      ).toEqual({ kind: 'resumed', sessionId: SESSION });
    });

    it('is an attach naming it, when the conversation was already live — S-24', () => {
      expect(
        resumeAnswer(
          frame({
            kind: 'ack',
            type: 'session.attached',
            payload: { sessionId: SESSION, claudeSessionId: CONVERSATION, gap: false },
          }),
          request,
        ),
      ).toEqual({ kind: 'resumed', sessionId: SESSION });
    });

    it('is a refusal of this very command, translated from its key — B-13', () => {
      const answer = resumeAnswer(
        frame({
          kind: 'error',
          type: 'error',
          correlationId: 'cmd-1',
          traceId: 'trace-1',
          payload: { code: 'WORKSPACE_NOT_ALLOWED', messageKey: 'workspace.error.notAllowed' },
        }),
        request,
      );

      expect(answer).toMatchObject({
        kind: 'refused',
        error: { code: 'WORKSPACE_NOT_ALLOWED', messageKey: 'workspace.error.notAllowed' },
      });
    });

    it.each([
      [
        'a refusal of another command',
        { kind: 'error', type: 'error', correlationId: 'cmd-2', payload: {} },
      ],
      ['another conversation starting', { payload: { sessionId: SESSION, claudeSessionId: FORK } }],
      ['a start that names no session', { payload: { claudeSessionId: CONVERSATION } }],
      ['anything else', { type: 'message.delta', payload: { messageId: 'm1' } }],
    ] as const)('is not %s', (_case, overrides) => {
      expect(resumeAnswer(frame(overrides as Partial<Envelope>), request)).toBeNull();
    });

    it('falls back to the command id for the trace of a refusal that carries none', () => {
      const answer = resumeAnswer(
        frame({ kind: 'error', type: 'error', correlationId: 'cmd-1', payload: {} }),
        request,
      );

      expect(answer).toMatchObject({ kind: 'refused', error: { traceId: 'cmd-1' } });
    });
  });

  it('reads which conversation a start is, and only from a start', () => {
    expect(
      conversationOfStart(frame({ payload: { claudeSessionId: FORK, resumedFrom: CONVERSATION } })),
    ).toEqual({ claudeSessionId: FORK, resumedFrom: CONVERSATION });
    expect(conversationOfStart(frame({}))).toEqual({ claudeSessionId: null, resumedFrom: null });
    expect(conversationOfStart(frame({ type: 'turn.completed' }))).toBeNull();
  });
});

describe('the history, through the live reducer — plan 04, B-03', () => {
  const said = (messageId: string, text: string, role = 'assistant') => ({
    type: 'message.completed',
    payload: { messageId, role, content: [{ type: 'text', text }] },
  });

  it('rebuilds a conversation from its events', () => {
    const conversation = conversationFrom([
      said('m1', 'hi', 'user'),
      {
        type: 'tool.started',
        payload: { toolUseId: 't1', toolName: 'Read', input: { file_path: 'a' } },
      },
      { type: 'tool.completed', payload: { toolUseId: 't1', status: 'succeeded' } },
      said('m2', 'done'),
    ]);

    expect(conversation.messages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'hi'],
      ['assistant', 'done'],
    ]);
    expect(conversation.tools).toMatchObject([{ toolUseId: 't1', status: 'succeeded' }]);
  });

  it('is nothing at all for no events', () => {
    expect(conversationFrom([])).toEqual(SILENT);
  });

  it('reads nothing into an event named after something every object has', () => {
    // The readers are looked up by type; a type that is a property of `Object.prototype` must be
    // as unknown as any other, and leave the conversation as it was.
    const conversation = conversationFrom([
      { type: 'constructor', payload: {} },
      { type: 'toString', payload: {} },
      { type: '__proto__', payload: {} },
    ]);

    expect(conversation).toBe(SILENT);
  });

  it('lays the history under the stream: history first, the stream on top — S-15', () => {
    const live = conversationFrom([
      said('m2', 'two, live'),
      said('m3', 'three'),
      { type: 'tool.started', payload: { toolUseId: 't1', toolName: 'Bash', input: {} } },
    ]);

    const merged = withHistory({ ...live, status: 'running' }, [
      said('m1', 'one'),
      said('m2', 'two, history'),
      { type: 'tool.started', payload: { toolUseId: 't0', toolName: 'Read', input: {} } },
      {
        type: 'tool.started',
        payload: { toolUseId: 't1', toolName: 'Bash', input: { old: true } },
      },
    ]);

    expect(merged.messages.map((message) => message.text)).toEqual(['one', 'two, live', 'three']);
    expect(merged.tools.map((tool) => [tool.toolUseId, tool.input])).toEqual([
      ['t0', {}],
      ['t1', {}],
    ]);
    // Where the session is belongs to the stream alone.
    expect(merged.status).toBe('running');
  });

  it('keeps a message the history has whole over fragments of it still streaming live', () => {
    const streaming = readEvent(conversationFrom([]), {
      v: 1,
      id: 'e1',
      kind: 'event',
      type: 'message.delta',
      ts: '2026-10-01T00:00:00.000Z',
      seq: 1,
      payload: { messageId: 'm1', delta: 'hal' },
    });

    expect(withHistory(streaming, [said('m1', 'whole')]).messages).toMatchObject([
      { messageId: 'm1', role: 'assistant', text: 'whole', isComplete: true },
    ]);
  });
});

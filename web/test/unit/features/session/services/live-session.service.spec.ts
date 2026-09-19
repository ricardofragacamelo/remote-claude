import { describe, expect, it } from 'vitest';

import {
  closeSession,
  interruptSession,
  sendPrompt,
  setSessionModel,
  setSessionPermissionMode,
  startSession,
} from '@/features/session/services/live-session.service';
import type { WsClient } from '@/shared/api/ws-client';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

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
  it('opens a session on a workspace', () => {
    const { client, sent } = aClient();

    expect(startSession(client, '/srv/projects/app')).toBe(true);
    expect(sent).toEqual([
      { type: 'session.start', payload: { workspacePath: '/srv/projects/app' } },
    ]);
  });

  it('sends a turn', () => {
    const { client, sent } = aClient();

    sendPrompt(client, SESSION, 'do the work');

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

    setSessionModel(client, SESSION, 'claude-opus-5');

    expect(sent[0]?.payload).toEqual({ sessionId: SESSION, model: 'claude-opus-5' });
  });

  it('changes the permission mode', () => {
    const { client, sent } = aClient();

    setSessionPermissionMode(client, SESSION, 'acceptEdits');

    expect(sent[0]?.payload).toEqual({ sessionId: SESSION, mode: 'acceptEdits' });
  });

  it('never pretends a command left while the socket is down', () => {
    const { client } = aClient(false);

    expect(sendPrompt(client, SESSION, 'hello')).toBe(false);
  });
});

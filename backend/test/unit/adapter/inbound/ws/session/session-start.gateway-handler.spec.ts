import { describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { SessionStartHandler } from '@adapter/inbound/ws/session/session-start.gateway-handler';
import type { StartSessionUseCase, StartedSession } from '@application/session';
import type { StartSessionCommand } from '@application/session';
import type { EventDraft } from '@infra/websocket/session-hub';
import { InputValidationError } from '@shared/errors/input-validation.error';
import {
  aConversation,
  aSession,
  CONVERSATION_ID,
  SESSION_ID,
} from '../../../../../support/builders/session.builder';
import { aWsContext } from '../../../../../support/builders/ws-context.builder';

const SOURCE = '0f0e0d0c-0b0a-4908-8706-050403020100';

function frame(payload: unknown): Envelope {
  return {
    v: 1,
    id: 'cmd-1',
    kind: 'command',
    type: 'session.start',
    ts: '2026-09-18T12:00:00.000Z',
    traceId: 'trace-1',
    payload: payload as Readonly<Record<string, unknown>>,
  };
}

/** A use case that answers what the test says, and remembers what it was asked. */
function answering(started: StartedSession): {
  useCase: StartSessionUseCase;
  commands: StartSessionCommand[];
} {
  const commands: StartSessionCommand[] = [];
  const useCase = {
    execute: (command: StartSessionCommand) => {
      commands.push(command);
      return Promise.resolve(started);
    },
  } as unknown as StartSessionUseCase;

  return { useCase, commands };
}

describe('SessionStartHandler', () => {
  const run = async (
    started: StartedSession,
    payload: unknown = { workspacePath: '/srv/projects/app' },
    installId: string | null = null,
  ): Promise<{
    ack: { type: string; payload: Readonly<Record<string, unknown>> };
    published: { sessionId: string; event: EventDraft }[];
    attached: string[];
    commands: StartSessionCommand[];
  }> => {
    const { useCase, commands } = answering(started);
    const attached: string[] = [];
    const published: { sessionId: string; event: EventDraft }[] = [];
    const context = aWsContext({
      frame: frame(payload),
      installId,
      attached,
      replay: () => ({ events: [], oldestAvailableSeq: 4, gap: false }),
      publish: (sessionId, event) => published.push({ sessionId, event }),
    });

    const outcome = await new SessionStartHandler(useCase).handle(context);
    outcome.publish();

    return { ack: outcome.ack, published, attached, commands };
  };

  it('accepts, attaches the caller, and announces the new session with its conversation', async () => {
    const result = await run({
      session: aSession(),
      conversation: aConversation(),
      joined: false,
    });

    expect(result.ack).toEqual({ type: 'command.accepted', payload: { command: 'session.start' } });
    expect(result.attached).toEqual([SESSION_ID]);
    expect(result.published).toEqual([
      {
        sessionId: SESSION_ID,
        event: {
          type: 'session.started',
          payload: {
            sessionId: SESSION_ID,
            workspacePath: '/srv/projects/app',
            model: 'claude-sonnet-5',
            permissionMode: 'default',
            claudeSessionId: CONVERSATION_ID,
          },
          correlationId: 'cmd-1',
          traceId: 'trace-1',
        },
      },
    ]);
  });

  it('says what a resumed session continues — B-11', async () => {
    const result = await run({
      session: aSession(),
      conversation: aConversation(CONVERSATION_ID, SOURCE),
      joined: false,
    });

    expect(result.published[0]?.event.payload).toMatchObject({
      claudeSessionId: CONVERSATION_ID,
      resumedFrom: SOURCE,
    });
  });

  it('answers a resume of what is live as an attach, and announces nothing — S-24', async () => {
    const result = await run(
      { session: aSession(), conversation: aConversation(CONVERSATION_ID, SOURCE), joined: true },
      { workspacePath: '/srv/projects/app', resumeSessionId: SOURCE },
    );

    expect(result.ack).toEqual({
      type: 'session.attached',
      payload: {
        sessionId: SESSION_ID,
        replayed: 0,
        oldestAvailableSeq: 4,
        gap: false,
        claudeSessionId: CONVERSATION_ID,
        resumedFrom: SOURCE,
      },
    });
    expect(result.attached).toEqual([SESSION_ID]);
    expect(result.published).toEqual([]);
  });

  it('hands the use case what the client asked, and `null` for what it did not', async () => {
    const result = await run(
      { session: aSession(), conversation: aConversation(), joined: false },
      { workspacePath: '/srv/projects/app', model: 'claude-opus-5', resumeSessionId: SOURCE },
    );

    expect(result.commands[0]).toMatchObject({
      workspacePath: '/srv/projects/app',
      model: 'claude-opus-5',
      permissionMode: null,
      resumeSessionId: SOURCE,
    });
  });

  it('says which client opened the session: a browser, or the app — plan 08, B-07', async () => {
    const started = { session: aSession(), conversation: aConversation(), joined: false };

    expect((await run(started)).commands[0]?.openedFrom).toBe('web');
    expect(
      (await run(started, { workspacePath: '/srv/projects/app' }, 'install-1')).commands[0]
        ?.openedFrom,
    ).toBe('mobile');
  });

  it.each([
    ['no workspace', {}],
    ['an empty resume id', { workspacePath: '/srv/projects/app', resumeSessionId: '' }],
    ['an unknown permission mode', { workspacePath: '/srv/projects/app', permissionMode: 'yolo' }],
  ])('refuses a frame with %s', async (_case, payload) => {
    await expect(
      run({ session: aSession(), conversation: aConversation(), joined: false }, payload),
    ).rejects.toThrow(InputValidationError);
  });
});

import { describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { SessionRewindHandler } from '@adapter/inbound/ws/session/session-rewind.gateway-handler';
import type { RewindFilesCommand, RewindFilesUseCase, RewindOutcome } from '@application/session';
import { RewindIncompleteError, SessionLockedError } from '@domain/session';
import type { EventDraft } from '@infra/websocket/session-hub';
import { SESSION_ID } from '../../../../../support/builders/session.builder';
import { aWsContext } from '../../../../../support/builders/ws-context.builder';
import { RecordingBroadcaster } from '../../../../../support/fakes/recording-broadcaster';

const frame: Envelope = {
  v: 1,
  id: 'cmd-1',
  kind: 'command',
  type: 'session.rewindFiles',
  ts: '2026-09-26T12:00:00.000Z',
  traceId: 'trace-1',
  payload: { sessionId: SESSION_ID, promptId: 'p1' },
};

const complete: RewindOutcome = {
  promptId: 'p1',
  reverted: [{ path: '/srv/a.md', action: 'restored' }],
  preserved: [{ path: '/srv/b.md', reason: 'modifiedOutside' }],
  unchanged: [],
  failed: [],
};

/** A use case that answers `outcome`, or throws `error`, and remembers what it was asked. */
function rewinding(answer: RewindOutcome | Error): {
  useCase: RewindFilesUseCase;
  asked: RewindFilesCommand[];
} {
  const asked: RewindFilesCommand[] = [];
  const useCase = {
    execute: (command: RewindFilesCommand) => {
      asked.push(command);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  } as unknown as RewindFilesUseCase;

  return { useCase, asked };
}

describe('SessionRewindHandler', () => {
  it('acks, and only then tells everybody watching what the undo did — B-18', async () => {
    const { useCase, asked } = rewinding(complete);
    const broadcaster = new RecordingBroadcaster();
    const published: { sessionId: string; event: EventDraft }[] = [];
    const handler = new SessionRewindHandler(useCase, broadcaster);

    const outcome = await handler.handle(
      aWsContext({ frame, publish: (sessionId, event) => published.push({ sessionId, event }) }),
    );

    expect(outcome.ack).toEqual({
      type: 'command.accepted',
      payload: { command: 'session.rewindFiles' },
    });
    expect(asked[0]).toMatchObject({ sessionId: SESSION_ID, promptId: 'p1' });
    expect(published).toEqual([]);

    outcome.publish();

    expect(published).toEqual([
      {
        sessionId: SESSION_ID,
        event: {
          type: 'session.rewound',
          payload: complete,
          correlationId: 'cmd-1',
          traceId: 'trace-1',
        },
      },
    ]);
    expect(broadcaster.errors).toEqual([]);
  });

  it('follows an incomplete undo with an error to everybody watching — S-44', async () => {
    const { useCase } = rewinding({ ...complete, failed: [{ path: '/srv/c.md' }] });
    const broadcaster = new RecordingBroadcaster();
    const handler = new SessionRewindHandler(useCase, broadcaster);

    (await handler.handle(aWsContext({ frame }))).publish();

    expect(broadcaster.errors).toHaveLength(1);
    expect(broadcaster.errors[0]?.sessionId).toBe(SESSION_ID);
    expect(broadcaster.errors[0]?.error).toBeInstanceOf(RewindIncompleteError);
    expect(broadcaster.errors[0]?.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      messageKey: 'session.error.rewindIncomplete',
      params: { failed: 1 },
    });
  });

  it('lets a refusal through as the error of the command, and publishes nothing — S-43', async () => {
    const { useCase } = rewinding(new SessionLockedError(SESSION_ID, 'turnRunning'));
    const handler = new SessionRewindHandler(useCase, new RecordingBroadcaster());

    await expect(handler.handle(aWsContext({ frame }))).rejects.toThrow(SessionLockedError);
  });

  it('refuses a frame without a point to go back to', async () => {
    const { useCase, asked } = rewinding(complete);
    const handler = new SessionRewindHandler(useCase, new RecordingBroadcaster());

    await expect(
      handler.handle(aWsContext({ frame: { ...frame, payload: { sessionId: SESSION_ID } } })),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(asked).toEqual([]);
  });
});

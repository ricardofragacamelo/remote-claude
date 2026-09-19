import { describe, expect, it } from 'vitest';

import { DiskSessionFileJournal } from '@adapter/outbound/session/disk-session-file.journal';
import { HubSessionBroadcaster } from '@adapter/outbound/session/hub-session.broadcaster';
import type { FileSnapshotStore } from '@adapter/outbound/checkpoint/file-snapshot.store';
import type { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { SessionId } from '@domain/session';
import type { TurnFileCheckpoint } from '@domain/session';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import { EventBuffer } from '@infra/websocket/event-buffer';
import { FrameBuilder } from '@infra/websocket/frame-builder';
import { SessionHub } from '@infra/websocket/session-hub';
import { runWithTrace } from '@shared/logging/trace-context';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';

const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const now = new Date('2026-09-18T12:00:00.000Z');

/** A store that answers one fixed thing, so a branch can be reached without a filesystem. */
function storeAnswering(kind: 'unreadable' | 'tooLarge'): FileSnapshotStore {
  return {
    capture: () => Promise.resolve(kind === 'tooLarge' ? { kind, sizeBytes: 99 } : { kind }),
    measure: () => Promise.resolve(null),
  } as unknown as FileSnapshotStore;
}

describe('DiskSessionFileJournal, at its edges', () => {
  const build = (store: FileSnapshotStore, saved: TurnFileCheckpoint[]): DiskSessionFileJournal =>
    new DiskSessionFileJournal(
      {
        saveCheckpointIfAbsent: (checkpoint: TurnFileCheckpoint) => {
          saved.push(checkpoint);
          return Promise.resolve();
        },
      } as unknown as DrizzleSessionFileRepository,
      store,
      new FixedClock(now),
      new RecordingLogger().logger,
    );

  it('records a file it could not read as not restorable', () => {
    // Not a failure to hide: the undo has to know it cannot promise this path.
    const saved: TurnFileCheckpoint[] = [];

    return build(storeAnswering('unreadable'), saved)
      .captureBefore(sessionId, 'prompt-1', '/srv/a.md')
      .then(() => {
        expect(saved[0]?.restorable).toBe('unreadable');
        expect(saved[0]?.canBeRestored).toBe(false);
      });
  });

  it('records the size of a file that was too large to keep', () => {
    const saved: TurnFileCheckpoint[] = [];

    return build(storeAnswering('tooLarge'), saved)
      .captureBefore(sessionId, 'prompt-1', '/srv/a.md')
      .then(() => {
        expect(saved[0]?.snapshot()).toMatchObject({ restorable: 'tooLarge', sizeBytes: 99 });
      });
  });

  it('forgets the labels of a session once it is over', async () => {
    const saved: TurnFileCheckpoint[] = [];
    const journal = build(storeAnswering('unreadable'), saved);

    await journal.openTurn(sessionId, 'prompt-1', 'refactor the parser');
    journal.forget(sessionId);
    await journal.captureBefore(sessionId, 'prompt-1', '/srv/a.md');

    // A label kept for a session that has ended is memory the process never gives back.
    expect(saved[0]?.snapshot().promptText).toBeNull();
  });

  it('keeps the labels of a session that is still running', async () => {
    const saved: TurnFileCheckpoint[] = [];
    const journal = build(storeAnswering('unreadable'), saved);

    await journal.openTurn(sessionId, 'prompt-1', 'refactor the parser');
    journal.forget(SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY0'));
    await journal.captureBefore(sessionId, 'prompt-1', '/srv/a.md');

    expect(saved[0]?.snapshot().promptText).toBe('refactor the parser');
  });
});

describe('HubSessionBroadcaster, on a failure', () => {
  const build = (): { broadcaster: HubSessionBroadcaster; sent: string[] } => {
    const sent: string[] = [];
    const registry = new ConnectionRegistry();
    const connection = registry.register('c1', {
      send: (data: string) => sent.push(data),
      close: () => undefined,
    });
    connection.attached.add(sessionId.value);

    const hub = new SessionHub(
      registry,
      new EventBuffer(10),
      new FrameBuilder(new FixedClock(now), new SequentialIds()),
      new RecordingLogger().logger,
    );

    return { broadcaster: new HubSessionBroadcaster(hub), sent };
  };

  it('quotes the trace of the request it happened inside', () => {
    const { broadcaster, sent } = build();

    runWithTrace({ traceId: 'trace-1' }, () => {
      broadcaster.publishError(sessionId, new Error('boom'));
    });

    expect(JSON.parse(sent[0] ?? '{}')).toMatchObject({
      kind: 'error',
      payload: { traceId: 'trace-1' },
    });
  });

  it('still reports the failure when there is no trace to quote', () => {
    // A hook fires outside any request. An error nobody can trace is worse than one labelled
    // `unknown`, and dropping it would be worse than both.
    const { broadcaster, sent } = build();

    broadcaster.publishError(sessionId, new Error('boom'));

    expect(JSON.parse(sent[0] ?? '{}')).toMatchObject({ payload: { traceId: 'unknown' } });
  });

  it('carries no sequence, because a failure is not part of the history', () => {
    const { broadcaster, sent } = build();
    broadcaster.publishError(sessionId, new Error('boom'));

    expect('seq' in (JSON.parse(sent[0] ?? '{}') as Record<string, unknown>)).toBe(false);
  });
});

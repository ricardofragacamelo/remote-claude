import { beforeEach, describe, expect, it } from 'vitest';

import {
  ReapIdleSessionsUseCase,
  SessionEnder,
  ShutdownSessionsUseCase,
} from '@application/session';
import type { LiveSession, SessionRegistry } from '@application/session';
import type { Session } from '@domain/session';
import {
  aClock,
  aRegistry,
  aSession,
  RecordingHandle,
  SESSION_ID,
} from '../../../support/builders/session.builder';
import type { FixedClock } from '../../../support/fakes/fixed-clock';
import { RecordingBroadcaster } from '../../../support/fakes/recording-broadcaster';

/** A second session, with an id of its own. */
const OTHER_ID = '01J0ABCDEFGHJKMNPQRSTVWXZZ';

/** Half an hour: the TTL of the product (D-02). */
const TTL_MS = 30 * 60 * 1000;

describe('the ends of a live session — plan 05, F0', () => {
  let clock: FixedClock;
  let broadcaster: RecordingBroadcaster;
  let registry: SessionRegistry;
  let handles: Map<string, RecordingHandle>;
  let first: Session;
  let second: Session;
  let ender: SessionEnder;

  beforeEach(() => {
    clock = aClock();
    first = aSession();
    second = aSession({ id: OTHER_ID });
    ({ registry, handles } = aRegistry([first, second], 10, clock));
    broadcaster = new RecordingBroadcaster();
    ender = new SessionEnder(registry, broadcaster);
  });

  const handleOf = (session: Session): RecordingHandle =>
    handles.get(session.id.value) as RecordingHandle;

  const liveOf = (session: Session): LiveSession => {
    const live = registry.find(session.id);
    if (live === null) {
      throw new Error(`${session.id.value} is not live`);
    }
    return live;
  };

  describe('SessionEnder', () => {
    it('announces, releases and forgets, and frees the slot at once — S-03', async () => {
      await ender.end(liveOf(first), 'closedByUser');

      expect(first.closeReason).toBe('closedByUser');
      expect(handleOf(first).closes).toBe(1);
      expect(registry.find(first.id)).toBeNull();
      expect(registry.size).toBe(1);
      expect(broadcaster.events).toEqual([
        {
          sessionId: SESSION_ID,
          event: {
            type: 'session.closed',
            payload: { sessionId: SESSION_ID, reason: 'closedByUser' },
          },
        },
      ]);
    });

    it('never announces a session twice', () => {
      const live = liveOf(first);

      expect(ender.announce(live, 'shutdown')).toBe(true);
      expect(ender.announce(live, 'idleTimeout')).toBe(false);
      expect(broadcaster.types).toEqual(['session.closed']);
      expect(first.closeReason).toBe('shutdown');
    });

    it('forgets the session even when its subprocess refuses to close', async () => {
      handleOf(first).failWith = new Error('already gone');

      await expect(ender.end(liveOf(first), 'closedByUser')).rejects.toThrow('already gone');
      expect(registry.find(first.id)).toBeNull();
    });
  });

  describe('ReapIdleSessionsUseCase — B-02', () => {
    const reaper = (): ReapIdleSessionsUseCase =>
      new ReapIdleSessionsUseCase(registry, ender, clock, TTL_MS);

    beforeEach(() => {
      first.moveTo('idle');
      second.moveTo('idle');
    });

    it('closes a session idle past the TTL, with idleTimeout — S-04', async () => {
      clock.advance(TTL_MS);

      expect(await reaper().execute()).toBe(2);
      expect(first.closeReason).toBe('idleTimeout');
      expect(registry.size).toBe(0);
      expect(broadcaster.events.map(({ event }) => event.payload)).toEqual([
        { sessionId: SESSION_ID, reason: 'idleTimeout' },
        { sessionId: OTHER_ID, reason: 'idleTimeout' },
      ]);
    });

    it('leaves a session that is not yet past the TTL', async () => {
      clock.advance(TTL_MS - 1);

      expect(await reaper().execute()).toBe(0);
      expect(registry.size).toBe(2);
    });

    it('leaves a session waiting for permission, however long it waits — S-05', async () => {
      first.moveTo('thinking');
      first.moveTo('waitingPermission');
      clock.advance(10 * TTL_MS);

      expect(await reaper().execute()).toBe(1);
      expect(registry.find(first.id)).not.toBeNull();
      expect(first.isClosed).toBe(false);
    });

    it('leaves a session somebody acted on inside the TTL', async () => {
      clock.advance(TTL_MS - 1_000);
      registry.require(first.id, first.ownerId);
      clock.advance(1_000);

      expect(await reaper().execute()).toBe(1);
      expect(registry.find(first.id)).not.toBeNull();
    });

    it('closes the others even when one subprocess refuses to close', async () => {
      handleOf(first).failWith = new Error('stuck');
      clock.advance(TTL_MS);

      expect(await reaper().execute()).toBe(2);
      expect(registry.size).toBe(0);
    });
  });

  describe('ShutdownSessionsUseCase — B-04', () => {
    const shutdown = (): ShutdownSessionsUseCase => new ShutdownSessionsUseCase(registry, ender);

    it('announces every session as shut down, before anything is closed', () => {
      expect(shutdown().announce()).toBe(2);
      expect(broadcaster.events.map(({ event }) => event.payload)).toEqual([
        { sessionId: SESSION_ID, reason: 'shutdown' },
        { sessionId: OTHER_ID, reason: 'shutdown' },
      ]);
      expect(handleOf(first).closes).toBe(0);
    });

    it('closes every subprocess and leaves nothing live — S-08', async () => {
      const use = shutdown();
      use.announce();

      expect(await use.release()).toEqual({ closed: 2, failed: 0 });
      expect(handleOf(first).closes).toBe(1);
      expect(handleOf(second).closes).toBe(1);
      expect(registry.all()).toEqual([]);
    });

    it('counts a subprocess that refused, and forgets it anyway', async () => {
      handleOf(second).failWith = new Error('stuck');

      expect(await shutdown().release()).toEqual({ closed: 1, failed: 1 });
      expect(registry.all()).toEqual([]);
    });

    it('does nothing the second time — S-14', async () => {
      const use = shutdown();
      use.announce();
      await use.release();

      expect(use.announce()).toBe(0);
      expect(await use.release()).toEqual({ closed: 0, failed: 0 });
      expect(broadcaster.types).toEqual(['session.closed', 'session.closed']);
      expect(handleOf(first).closes).toBe(1);
    });
  });
});

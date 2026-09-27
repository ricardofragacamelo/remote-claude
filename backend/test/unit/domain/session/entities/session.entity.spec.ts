import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  InvalidSessionTransitionError,
  SessionClosedError,
  SessionLockedError,
} from '@domain/session';
import { aSession } from '../../../../support/builders/session.builder';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');

describe('Session', () => {
  it('opens in `starting`, because the subprocess is not up yet', () => {
    const session = aSession();

    expect(session.status).toBe('starting');
    expect(session.isClosed).toBe(false);
    expect(session.closeReason).toBeNull();
  });

  it('carries the workspace, the model and the mode it was opened with', () => {
    const session = aSession({ model: 'claude-opus-5', permissionMode: 'plan' });

    expect(session.workspace.value).toBe('/srv/projects/app');
    expect(session.model).toBe('claude-opus-5');
    expect(session.permissionMode).toBe('plan');
  });

  it('knows who it belongs to', () => {
    expect(aSession().isOwnedBy(owner)).toBe(true);
    expect(aSession().isOwnedBy(stranger)).toBe(false);
  });

  describe('moving', () => {
    it('follows the machine', () => {
      const session = aSession();

      session.moveTo('idle');
      session.moveTo('thinking');
      session.moveTo('running');

      expect(session.status).toBe('running');
    });

    it('treats being told the status it already has as nothing at all', () => {
      // The SDK reports the same thing twice often enough — two tools in a row both mean
      // `running` — and turning that into a violation would crash on an ordinary stream.
      const session = aSession();
      session.moveTo('idle');

      expect(() => {
        session.moveTo('idle');
      }).not.toThrow();
      expect(session.status).toBe('idle');
    });

    it('refuses a move the machine does not make', () => {
      expect(() => aSession().moveTo('running')).toThrow(InvalidSessionTransitionError);
    });

    it('says which session and which move, because it is a bug of ours', () => {
      expect.assertions(2);

      try {
        aSession().moveTo('waitingPermission');
      } catch (error) {
        const failure = error as InvalidSessionTransitionError;
        expect(failure.code).toBe('INTERNAL_ERROR');
        expect(failure.params).toMatchObject({ from: 'starting', to: 'waitingPermission' });
      }
    });

    it('refuses to move after closing', () => {
      const session = aSession();
      session.close('completed');

      expect(() => session.moveTo('idle')).toThrow(InvalidSessionTransitionError);
    });
  });

  describe('closing', () => {
    it('records why', () => {
      const session = aSession();
      session.close('failed');

      expect(session.status).toBe('closed');
      expect(session.closeReason).toBe('failed');
    });

    it('can be closed from any status', () => {
      const session = aSession();
      session.moveTo('idle');
      session.moveTo('thinking');
      session.close('shutdown');

      expect(session.isClosed).toBe(true);
    });

    it('keeps the first reason when it is closed twice', () => {
      // Closing runs from a command, from a `finally` and from the shutdown hook, and any two can
      // happen at once. The later reason is a consequence of the first; overwriting it would
      // replace the cause with its effect.
      const session = aSession();

      session.close('auditUnavailable');
      session.close('shutdown');

      expect(session.closeReason).toBe('auditUnavailable');
    });
  });

  describe('changing what it runs with', () => {
    it('takes a new model', () => {
      const session = aSession();
      session.setModel('claude-opus-5');

      expect(session.model).toBe('claude-opus-5');
    });

    it('takes a new permission mode', () => {
      const session = aSession();
      session.setPermissionMode('acceptEdits');

      expect(session.permissionMode).toBe('acceptEdits');
    });

    it.each([
      ['the model', (session: ReturnType<typeof aSession>) => session.setModel('x')],
      [
        'the mode',
        (session: ReturnType<typeof aSession>) => session.setPermissionMode('acceptEdits'),
      ],
    ])('refuses to change %s of a closed session', (_what, change) => {
      const session = aSession();
      session.close('completed');

      expect(() => change(session)).toThrow(SessionClosedError);
    });

    it('answers a closed session exactly as it answers a missing one', () => {
      expect.assertions(1);
      const session = aSession();
      session.close('completed');

      try {
        session.setModel('x');
      } catch (error) {
        // A distinct code would be the only way to learn that a session id was once real.
        expect((error as SessionClosedError).code).toBe('SESSION_NOT_FOUND');
      }
    });
  });

  describe('idleness — plan 05, D-02', () => {
    const openedAt = new Date('2026-09-18T12:00:00.000Z');
    const later = (ms: number): Date => new Date(openedAt.getTime() + ms);

    it('starts counting from the moment it opened', () => {
      expect(aSession({ openedAt }).lastActivityAt).toEqual(openedAt);
    });

    it('is idle once the TTL has passed with nothing happening — S-04', () => {
      const session = aSession({ openedAt });
      session.moveTo('idle');

      expect(session.isIdleFor(1_000, later(999))).toBe(false);
      expect(session.isIdleFor(1_000, later(1_000))).toBe(true);
    });

    it('starts counting again from the last activity', () => {
      const session = aSession({ openedAt });
      session.moveTo('idle');
      session.recordActivity(later(800));

      expect(session.isIdleFor(1_000, later(1_500))).toBe(false);
      expect(session.isIdleFor(1_000, later(1_800))).toBe(true);
    });

    it('never moves its activity back in time', () => {
      const session = aSession({ openedAt });
      session.recordActivity(later(800));
      session.recordActivity(later(100));

      expect(session.lastActivityAt).toEqual(later(800));
    });

    it('is never idle while waiting for permission, however long — S-05', () => {
      const session = aSession({ openedAt });
      session.moveTo('idle');
      session.moveTo('thinking');
      session.moveTo('waitingPermission');

      expect(session.isIdleFor(1_000, later(3_600_000))).toBe(false);
    });

    it.each(['thinking', 'running'] as const)('is never idle while %s', (status) => {
      const session = aSession({ openedAt });
      session.moveTo('idle');
      session.moveTo('thinking');
      session.moveTo(status);

      expect(session.isIdleFor(1_000, later(3_600_000))).toBe(false);
    });

    it('is not idle before it has started, nor once it is over', () => {
      const starting = aSession({ openedAt });
      const closed = aSession({ openedAt });
      closed.close('closedByUser');

      expect(starting.isIdleFor(1_000, later(3_600_000))).toBe(false);
      expect(closed.isIdleFor(1_000, later(3_600_000))).toBe(false);
    });

    it('can be closed for idleness, and says so', () => {
      const session = aSession();
      session.close('idleTimeout');

      expect(session.closeReason).toBe('idleTimeout');
    });
  });

  describe('the lock of an undo — plan 05, B-27', () => {
    it('takes the lock when idle, and gives it back', () => {
      const session = aSession();
      session.moveTo('idle');

      session.beginRewind();
      expect(session.isRewinding).toBe(true);

      session.endRewind();
      expect(session.isRewinding).toBe(false);
    });

    it('refuses the lock while a turn runs', () => {
      const session = aSession();
      session.moveTo('idle');
      session.moveTo('thinking');

      expect(() => {
        session.beginRewind();
      }).toThrow(SessionLockedError);
    });

    it('refuses a second undo while the first holds it — S-43 of plan 04', () => {
      const session = aSession();
      session.moveTo('idle');
      session.beginRewind();

      expect(() => {
        session.beginRewind();
      }).toThrow(expect.objectContaining({ params: { reason: 'rewindRunning' } }));
    });

    it('refuses a prompt while the undo holds it, and lets it through after — S-54', () => {
      const session = aSession();
      session.moveTo('idle');
      session.beginRewind();

      expect(() => {
        session.refusePromptWhileRewinding();
      }).toThrow(SessionLockedError);

      session.endRewind();
      expect(() => {
        session.refusePromptWhileRewinding();
      }).not.toThrow();
    });

    it('treats giving back a lock nobody holds as nothing at all', () => {
      const session = aSession();

      expect(() => {
        session.endRewind();
      }).not.toThrow();
      expect(session.isRewinding).toBe(false);
    });
  });
});

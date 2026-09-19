import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { InvalidSessionTransitionError, SessionClosedError } from '@domain/session';
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
});

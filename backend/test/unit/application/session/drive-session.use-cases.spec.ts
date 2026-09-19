import { beforeEach, describe, expect, it } from 'vitest';

import {
  CloseSessionUseCase,
  InterruptSessionUseCase,
  PromptSessionUseCase,
  SessionRegistry,
  SetSessionModelUseCase,
  SetSessionPermissionModeUseCase,
} from '@application/session';
import { UserId } from '@domain/auth';
import {
  InvalidSessionIdError,
  SessionForbiddenError,
  SessionNotFoundError,
} from '@domain/session';
import type { Session } from '@domain/session';
import {
  aRegistry,
  aSession,
  RecordingHandle,
  SESSION_ID,
} from '../../../support/builders/session.builder';
import { RecordingBroadcaster } from '../../../support/fakes/recording-broadcaster';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');

describe('the commands that drive a running session', () => {
  let registry: SessionRegistry;
  let handle: RecordingHandle;
  let session: Session;
  let broadcaster: RecordingBroadcaster;

  beforeEach(() => {
    session = aSession();
    const built = aRegistry([session]);
    registry = built.registry;
    handle = built.handles.get(SESSION_ID) as RecordingHandle;
    broadcaster = new RecordingBroadcaster();
  });

  describe('prompt', () => {
    it('queues the turn', () => {
      new PromptSessionUseCase(registry).execute(SESSION_ID, 'hello', owner);

      expect(handle.prompts).toEqual(['hello']);
    });

    it('queues a second prompt rather than refusing it — S-22', () => {
      // The SDK does this natively, it was measured, and it is what the Claude Code UI does.
      // Rejecting a concurrent prompt with a conflict was our own policy and it was wrong.
      const prompt = new PromptSessionUseCase(registry);

      prompt.execute(SESSION_ID, 'first', owner);
      prompt.execute(SESSION_ID, 'second', owner);

      expect(handle.prompts).toEqual(['first', 'second']);
    });

    it('preserves the order the prompts arrived in — S-23', () => {
      const prompt = new PromptSessionUseCase(registry);

      for (const text of ['a', 'b', 'c']) {
        prompt.execute(SESSION_ID, text, owner);
      }

      expect(handle.prompts).toEqual(['a', 'b', 'c']);
    });

    it('refuses a session that is not running', () => {
      expect(() =>
        new PromptSessionUseCase(aRegistry([]).registry).execute(SESSION_ID, 'x', owner),
      ).toThrow(SessionNotFoundError);
    });

    it("refuses somebody else's session as forbidden, not as absent", () => {
      expect(() => new PromptSessionUseCase(registry).execute(SESSION_ID, 'x', stranger)).toThrow(
        SessionForbiddenError,
      );
    });

    it('refuses an id that is not a ULID', () => {
      expect(() => new PromptSessionUseCase(registry).execute('nope', 'x', owner)).toThrow(
        InvalidSessionIdError,
      );
    });
  });

  describe('interrupt', () => {
    it('forwards the control request', async () => {
      await new InterruptSessionUseCase(registry).execute(SESSION_ID, owner);

      expect(handle.interrupts).toBe(1);
    });

    it('refuses a session that is already over — S-29', () => {
      // Nothing persists a live session, so "closed" and "never existed" are the same answer.
      return expect(
        new InterruptSessionUseCase(aRegistry([]).registry).execute(SESSION_ID, owner),
      ).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('setModel', () => {
    it('changes it on the subprocess and on the session', async () => {
      await new SetSessionModelUseCase(registry).execute(SESSION_ID, 'claude-opus-5', owner);

      expect(handle.models).toEqual(['claude-opus-5']);
      expect(session.model).toBe('claude-opus-5');
    });

    it('leaves the session alone when the subprocess refused', async () => {
      // The entity records what the SDK actually accepted, never what we asked for: a session
      // reporting a model it is not running is worse than one that failed visibly.
      handle.failWith = new Error('no such model');

      await expect(
        new SetSessionModelUseCase(registry).execute(SESSION_ID, 'nope', owner),
      ).rejects.toThrow('no such model');
      expect(session.model).toBe('claude-sonnet-5');
    });
  });

  describe('setPermissionMode', () => {
    it('changes it on the subprocess and on the session', async () => {
      await new SetSessionPermissionModeUseCase(registry).execute(SESSION_ID, 'acceptEdits', owner);

      expect(handle.modes).toEqual(['acceptEdits']);
      expect(session.permissionMode).toBe('acceptEdits');
    });
  });

  describe('close', () => {
    it('ends the session, forgets it and announces it', async () => {
      await new CloseSessionUseCase(registry, broadcaster).execute(SESSION_ID, owner);

      expect(handle.closes).toBe(1);
      expect(session.closeReason).toBe('closedByUser');
      expect(registry.find(session.id)).toBeNull();
      expect(broadcaster.events.at(-1)?.event).toMatchObject({
        type: 'session.closed',
        payload: { reason: 'closedByUser' },
      });
    });

    it('forgets the session even when releasing the subprocess failed', async () => {
      // Whatever the subprocess does on the way out, the entry goes and everybody is told. A
      // registry holding a session whose close threw is a session nobody can act on and nobody
      // can see ending.
      handle.failWith = new Error('already gone');

      await expect(
        new CloseSessionUseCase(registry, broadcaster).execute(SESSION_ID, owner),
      ).rejects.toThrow('already gone');

      expect(registry.find(session.id)).toBeNull();
      expect(broadcaster.events.at(-1)?.event.type).toBe('session.closed');
    });

    it("refuses somebody else's session as forbidden, and closes nothing — S-38", async () => {
      // Only the owner may end a session. `403` is what that is: the credential is good, and the
      // caller still may not ([D-17](../../../../docs/plans/01-live-session/decisions.md)).
      await expect(
        new CloseSessionUseCase(registry, broadcaster).execute(SESSION_ID, stranger),
      ).rejects.toThrow(SessionForbiddenError);
      expect(handle.closes).toBe(0);
    });
  });
});

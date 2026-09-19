import { beforeEach, describe, expect, it } from 'vitest';

import { SessionRegistry, StartSessionUseCase } from '@application/session';
import type {
  ClaudeSessionHandle,
  ClaudeSessionPort,
  ClaudeSessionStart,
  SessionEvent,
} from '@application/session';
import { UserId } from '@domain/auth';
import { SessionLimitReachedError } from '@domain/session';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import { RecordingHandle } from '../../../support/builders/session.builder';
import { RecordingBroadcaster } from '../../../support/fakes/recording-broadcaster';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const now = new Date('2026-09-18T12:00:00.000Z');

const defaults = { model: 'claude-sonnet-5', permissionMode: 'default' } as const;

/** A port that hands back a recording handle and keeps the callbacks the use case installed. */
class StubClaude implements ClaudeSessionPort {
  readonly starts: ClaudeSessionStart[] = [];
  readonly handle = new RecordingHandle();
  failWith: Error | null = null;

  start(input: ClaudeSessionStart): Promise<ClaudeSessionHandle> {
    this.starts.push(input);

    return this.failWith === null ? Promise.resolve(this.handle) : Promise.reject(this.failWith);
  }

  /** Replays an event as the runner would. */
  emit(event: SessionEvent): void {
    this.starts[0]?.onEvent(event);
  }
}

describe('StartSessionUseCase', () => {
  let claude: StubClaude;
  let registry: SessionRegistry;
  let broadcaster: RecordingBroadcaster;
  let resolved: string[];

  // Shared across builds on purpose: a fresh generator per call would mint the same id twice, and
  // two sessions with one id is a registry holding one entry and a limit that never trips.
  let ids: SequentialIds;

  const workspaces = {
    resolve: (rawPath: string) => {
      resolved.push(rawPath);

      return rawPath.startsWith('/srv/projects')
        ? Promise.resolve(WorkspacePath.create(rawPath))
        : Promise.reject(new WorkspaceNotAllowedError(rawPath));
    },
  };

  beforeEach(() => {
    claude = new StubClaude();
    registry = new SessionRegistry(2);
    broadcaster = new RecordingBroadcaster();
    resolved = [];
    ids = new SequentialIds();
  });

  const build = (): StartSessionUseCase =>
    new StartSessionUseCase(
      workspaces,
      registry,
      claude,
      broadcaster,
      new FixedClock(now),
      ids,
      defaults,
    );

  const start = (workspacePath = '/srv/projects/app'): ReturnType<StartSessionUseCase['execute']> =>
    build().execute({
      workspacePath,
      model: null,
      permissionMode: null,
      resumeSessionId: null,
      userId: owner,
    });

  it('opens a session on a workspace that cleared the allowlist — S-21', async () => {
    const session = await start();

    expect(session.workspace.value).toBe('/srv/projects/app');
    // `idle`, not `starting`: the subprocess is up and nothing is running in it. Leaving it in
    // `starting` would freeze the machine — that state reaches only `idle` and `closed`, so the
    // first delta of the first turn would be an illegal transition, dropped by `observe`.
    expect(session.status).toBe('idle');
    expect(registry.find(session.id)).not.toBeNull();
  });

  it('opens with the installation defaults when the client states none', async () => {
    const session = await start();

    expect(session.model).toBe('claude-sonnet-5');
    expect(session.permissionMode).toBe('default');
  });

  it('opens with what the client asked for when it asked', async () => {
    const session = await build().execute({
      workspacePath: '/srv/projects/app',
      model: 'claude-opus-5',
      permissionMode: 'plan',
      resumeSessionId: 'sdk-1',
      userId: owner,
    });

    expect(session.model).toBe('claude-opus-5');
    expect(claude.starts[0]?.permissionMode).toBe('plan');
    expect(claude.starts[0]?.resumeSessionId).toBe('sdk-1');
  });

  describe('the order of the checks', () => {
    it('refuses a path outside the allowlist, and spawns nothing', async () => {
      // `cwd` of the SDK's `query()` is exactly this path. A session that got as far as spawning
      // on an unchecked directory is a shell on the user's machine.
      await expect(start('/etc')).rejects.toThrow(WorkspaceNotAllowedError);

      expect(claude.starts).toEqual([]);
      expect(registry.size).toBe(0);
    });

    it('checks the path before taking a slot', async () => {
      await expect(start('/etc')).rejects.toThrow(WorkspaceNotAllowedError);
      await expect(start()).resolves.toBeDefined();
      await expect(start()).resolves.toBeDefined();

      // Two sessions fit in a registry of two; the refused one never counted against them.
      expect(registry.size).toBe(2);
    });

    it('refuses the session beyond the limit, and leaves no subprocess behind', async () => {
      await start();
      await start();

      await expect(start()).rejects.toThrow(SessionLimitReachedError);
      expect(claude.starts).toHaveLength(2);
    });

    it('gives the slot back when the subprocess fails to come up', async () => {
      claude.failWith = new Error('spawn failed');

      await expect(start()).rejects.toThrow('spawn failed');
      expect(registry.size).toBe(0);
    });
  });

  describe('the stream', () => {
    it('publishes every event to whoever is watching', async () => {
      await start();
      claude.emit({ type: 'message.delta', payload: { messageId: 'm1', delta: 'hi' } });

      expect(broadcaster.types).toContain('message.delta');
    });

    it('moves the machine and announces the new status', async () => {
      const session = await start();
      claude.emit({ type: 'message.delta', payload: { messageId: 'm1', delta: 'hi' } });

      expect(session.status).toBe('thinking');
      expect(broadcaster.types).toEqual(['message.delta', 'session.statusChanged']);
    });

    it('says nothing about a status that did not change', async () => {
      await start();
      broadcaster.events.length = 0;

      claude.emit({ type: 'turn.completed', payload: {} });

      // `turn.completed` means `idle`, and a session whose subprocess is up already was.
      expect(broadcaster.types).toEqual(['turn.completed']);
    });

    it('reaches `waitingPermission`, which is the one the UI cannot guess', async () => {
      const session = await start();
      claude.emit({ type: 'message.delta', payload: {} });
      claude.emit({ type: 'permission.requested', payload: {} });

      expect(session.status).toBe('waitingPermission');
    });

    it('publishes an event that implies no status without touching the machine', async () => {
      const session = await start();

      claude.emit({ type: 'diag.pong', payload: {} });

      expect(session.status).toBe('idle');
      expect(broadcaster.events).toHaveLength(1);
    });
  });

  describe('when the stream ends', () => {
    const close = (reason: 'completed' | 'failed' = 'completed'): void => {
      claude.starts[0]?.onClosed(reason);
    };

    it('forgets the session and tells everybody', async () => {
      const session = await start();
      close();

      expect(registry.find(session.id)).toBeNull();
      expect(broadcaster.events.at(-1)?.event).toMatchObject({
        type: 'session.closed',
        payload: { reason: 'completed' },
      });
    });

    it('reports a crash as a failure rather than as a completion', async () => {
      await start();
      close('failed');

      expect(broadcaster.events.at(-1)?.event.payload).toMatchObject({ reason: 'failed' });
    });

    it('says whose fault a crash was, before saying the session is over — S-30', async () => {
      // Without it a subprocess that died looks exactly like a turn that finished. `502` and not
      // `500`: it is upstream that fell over.
      await start();
      close('failed');

      expect((broadcaster.errors.at(-1)?.error as { code: string }).code).toBe(
        'CLAUDE_UNAVAILABLE',
      );
    });

    it('says nothing of the sort when the stream simply ended', async () => {
      await start();
      close();

      expect(broadcaster.errors).toEqual([]);
    });

    it('frees the slot the session was holding', async () => {
      await start();
      await start();
      close();

      await expect(start()).resolves.toBeDefined();
    });

    it('does not announce a session that was already closed', async () => {
      // The close use case has already published its terminal event. A second one would put two
      // endings in the replay buffer and make the UI choose between them.
      const session = await start();
      session.close('closedByUser');
      broadcaster.events.length = 0;

      close();

      expect(broadcaster.events).toEqual([]);
    });
  });
});

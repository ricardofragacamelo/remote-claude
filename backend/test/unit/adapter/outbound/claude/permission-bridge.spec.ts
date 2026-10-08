import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionBridge } from '@adapter/outbound/claude/permission-bridge';
import { PermissionRequest } from '@domain/permission';
import type { PermissionQuestion } from '@application/session';
import {
  PERMISSION_OWNER,
  PERMISSION_SESSION,
  aPermissionModule,
} from '../../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../../support/builders/permission.builder';
import { aRegistry, aSession } from '../../../../support/builders/session.builder';
import type { Session } from '@domain/session';
import { RecordingBroadcaster } from '../../../../support/fakes/recording-broadcaster';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

/**
 * The promise the agent loop is held open by.
 *
 * Every case is about the one way out of a pending request: the `permission.resolved` event.
 * Whoever caused it — a person, a deadline, a session ending — the loop is released down the same
 * path, so there is exactly one place where a request can go from blocking to answered.
 */
describe('PermissionBridge', () => {
  let harness: PermissionHarness;
  let bridge: PermissionBridge;
  let log: RecordingLogger;
  let broadcaster: RecordingBroadcaster;
  let live: Session;
  let aborts: AbortController;

  beforeEach(() => {
    harness = aPermissionModule();
    log = new RecordingLogger();
    aborts = new AbortController();

    // Where a real session is when `canUseTool` fires: the stream has already reported a tool
    // starting, so the machine is in `running` rather than in `starting`.
    live = aSession({ ownerId: PERMISSION_OWNER.value });
    live.observe('idle');
    live.observe('thinking');
    live.observe('running');

    const sessions = aRegistry([live]).registry;
    broadcaster = new RecordingBroadcaster();
    bridge = new PermissionBridge(
      harness.request,
      harness.endSession,
      harness.applyMode,
      sessions,
      broadcaster,
      log.logger,
    );

    // The bus, wired as the container wires it: the bridge is a consumer of the event, not a
    // thing the permission module calls.
    harness.events.subscribe((event) => {
      bridge.onResolved(event);
    });
  });

  const question = (overrides: Partial<PermissionQuestion> = {}): PermissionQuestion => ({
    sessionId: PERMISSION_SESSION,
    requestId: 'request-1',
    toolUseId: 'toolu-1',
    toolName: 'Bash',
    input: { command: 'rm -rf build/' },
    signal: aborts.signal,
    ...overrides,
  });

  it('says the session is waiting on a person, and then that it is not', async () => {
    // The one status the UI cannot afford to confuse with `running`: a spinner for something
    // that will never finish on its own is a lie.
    const pending = bridge.ask(question());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(broadcaster.events.at(-1)?.event).toEqual({
      type: 'session.statusChanged',
      payload: { status: 'waitingPermission' },
    });

    await harness.resolve.execute({
      requestId: 'request-1',
      decision: 'allow',
      reason: null,
      scope: 'once',
      userId: PERMISSION_OWNER,
      resolvedFrom: 'web',
      watchesSession: () => true,
    });
    await pending;

    expect(broadcaster.events.at(-1)?.event).toEqual({
      type: 'session.statusChanged',
      payload: { status: 'running' },
    });
  });

  it('says nothing about the status of a session that has already gone', () => {
    const orphan = aPermissionModule();
    const quiet = new RecordingBroadcaster();
    const alone = new PermissionBridge(
      orphan.request,
      orphan.endSession,
      orphan.applyMode,
      aRegistry([]).registry,
      quiet,
      log.logger,
    );

    void alone.ask(question({ signal: AbortSignal.abort() }));

    expect(quiet.events).toEqual([]);
  });

  it('blocks until somebody answers, and then returns what they decided — S-50', async () => {
    const pending = bridge.ask(question());

    await Promise.resolve();
    await harness.resolve.execute({
      requestId: 'request-1',
      decision: 'allow',
      reason: null,
      scope: 'once',
      userId: PERMISSION_OWNER,
      resolvedFrom: 'web',
      watchesSession: () => true,
    });

    await expect(pending).resolves.toEqual({ decision: 'allow', reason: null });
  });

  it('is released by an answer that arrives while the request is still being written down', async () => {
    // The request is in the registry — answerable — before its row is stored. An answer in that
    // window settles it before `ask` has its outcome, and has to reach the loop all the same.
    const open = harness.requests.open.bind(harness.requests);
    harness.requests.open = async (request) => {
      await open(request);
      await harness.resolve.execute({
        requestId: request.id,
        decision: 'deny',
        reason: 'not now',
        scope: 'once',
        userId: PERMISSION_OWNER,
        resolvedFrom: 'mobile',
        watchesSession: () => true,
      });
    };

    await expect(bridge.ask(question())).resolves.toEqual({
      decision: 'deny',
      reason: 'not now',
    });
  });

  it('stops listening when the question could not be asked', async () => {
    harness.requests.open = () => Promise.reject(new Error('database down'));

    await expect(bridge.ask(question())).rejects.toThrow('database down');
  });

  it('returns immediately when a rule already answered — S-60', async () => {
    const request = PermissionRequest.open({
      id: 'request-2',
      sessionId: PERMISSION_SESSION,
      userId: PERMISSION_OWNER,
      projectPath: null,
      toolUseId: null,
      toolName: 'Bash',
      input: { command: 'git status' },
      riskHint: 'read',
      requestedAt: harness.clock.now(),
      expiresAt: harness.clock.now(),
    });
    harness.registry.add(request);
    request.resolve({
      decision: 'allow',
      reason: null,
      scope: 'session',
      resolvedBy: PERMISSION_OWNER,
      resolvedFrom: null,
      auto: true,
      at: harness.clock.now(),
    });

    await expect(bridge.ask(question({ requestId: 'request-2' }))).resolves.toEqual({
      decision: 'allow',
      reason: null,
    });
  });

  it('refuses when the deadline passes, with a sentence Claude can work with — S-51, S-63', async () => {
    const pending = bridge.ask(question());

    // A real tick, not a microtask: the deadline is armed only after the rules have been read, and
    // firing before that would fire nothing.
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.scheduler.fire();

    // The deadline's refusal carries no reason, because nobody gave one — and the agent still
    // needs something to read, so the bridge supplies the only honest one there is.
    await expect(pending).resolves.toEqual({
      decision: 'deny',
      reason: 'nobody answered before the deadline',
    });
  });

  describe('when the session dies with a request open — S-58', () => {
    it('refuses, because nobody is going to answer', async () => {
      const pending = bridge.ask(question());

      // A real tick, not a microtask: the promise is only registered after the request has been
      // opened, and aborting before that would exercise the already-aborted path instead.
      await new Promise((resolve) => setTimeout(resolve, 0));
      aborts.abort();

      await expect(pending).resolves.toEqual({
        decision: 'deny',
        reason: 'the session ended before the request was answered',
      });
    });

    it('refuses without waiting when the signal has already fired', async () => {
      aborts.abort();

      await expect(bridge.ask(question())).resolves.toMatchObject({ decision: 'deny' });
    });

    it('settles the requests the session left behind', async () => {
      await bridge.ask(question({ signal: AbortSignal.abort() }));
      bridge.forget(PERMISSION_SESSION);
      await Promise.resolve();

      expect(harness.registry.find('request-1')).toBeNull();
      expect(harness.requests.settled).toEqual(['request-1']);
    });

    it('logs, rather than throwing, when settling them fails', async () => {
      await bridge.ask(question({ signal: AbortSignal.abort() }));
      harness.requests.failWith = new Error('the database is gone');

      bridge.forget(PERMISSION_SESSION);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(log.lines.map((line) => line['msg'])).toContain(
        'the pending permission requests of a closed session could not be settled',
      );
    });
  });

  it('ignores a resolution it is not waiting on', () => {
    const request = PermissionRequest.open({
      id: 'somebody-else',
      sessionId: PERMISSION_SESSION,
      userId: PERMISSION_OWNER,
      projectPath: null,
      toolUseId: null,
      toolName: 'Read',
      input: {},
      riskHint: 'read',
      requestedAt: harness.clock.now(),
      expiresAt: harness.clock.now(),
    });

    expect(() => {
      bridge.onResolved({ request });
    }).not.toThrow();

    request.resolve(PermissionRequest.expiry(harness.clock.now()));
    expect(() => {
      bridge.onResolved({ request });
    }).not.toThrow();
  });

  describe('Permitir tudo — plan 23', () => {
    it('returns at once, and says what answered without the input — S-09, S-20', async () => {
      live.setPermissionMode('allowAll');

      await expect(bridge.ask(question({ input: { command: 'pnpm test' } }))).resolves.toEqual({
        decision: 'allow',
        reason: null,
      });

      const said = log.lines.find(
        (line) => line['msg'] === 'canUseTool answered without asking anybody',
      );
      expect(said).toMatchObject({
        op: 'claude.permission.request',
        sessionId: PERMISSION_SESSION.value,
        requestId: 'request-1',
        toolName: 'Bash',
        decision: 'allow',
        via: 'allowAll',
      });
      expect(JSON.stringify(said)).not.toContain('pnpm test');
    });

    it('releases a loop already waiting when the session switches to it — S-22', async () => {
      const pending = bridge.ask(question({ input: { command: 'pnpm test' } }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      live.setPermissionMode('allowAll');
      await bridge.modeChanged(PERMISSION_SESSION, 'allowAll');

      await expect(pending).resolves.toEqual({ decision: 'allow', reason: null });
      expect(log.lines.map((line) => line['msg'])).toContain(
        'the open requests of the session were re-read under its new mode',
      );
    });

    it('logs, rather than throwing, when the open requests cannot be re-read', async () => {
      void bridge.ask(question({ input: { command: 'pnpm test' } }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      harness.requests.failWith = new Error('the database is gone');

      await expect(bridge.modeChanged(PERMISSION_SESSION, 'allowAll')).resolves.toBeUndefined();
      expect(log.lines.map((line) => line['msg'])).toContain(
        'the open requests of the session could not be re-read under its new mode',
      );
    });
  });

  it('asks on behalf of a session that has already gone, rather than inventing an owner', async () => {
    // A tool call can reach `canUseTool` during teardown. The invocation is still put through the
    // module — a question nobody can answer is better than one nobody records.
    const orphan = aPermissionModule();
    const alone = new PermissionBridge(
      orphan.request,
      orphan.endSession,
      orphan.applyMode,
      aRegistry([]).registry,
      new RecordingBroadcaster(),
      log.logger,
    );

    void alone.ask(question({ signal: AbortSignal.abort() }));
    await Promise.resolve();

    expect(orphan.requests.opened).toEqual(['request-1']);
  });
});

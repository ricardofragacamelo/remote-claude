import { beforeEach, describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import {
  EngineRegistry,
  ModelCatalog,
  SessionRegistry,
  StartSessionUseCase,
} from '@application/session';
import type { SessionConfigurationSource, StartSessionCommand } from '@application/session';
import { UserId } from '@domain/auth';
import {
  EffortUnsupportedError,
  ForkPointUnknownError,
  SessionForkRejectedError,
  SessionLimitReachedError,
  SessionNotFoundError,
} from '@domain/session';
import type { Session } from '@domain/session';
import { ConversationRef, InvalidConversationRefError } from '@domain/engine';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import {
  ALL_CAPABILITIES,
  aClock,
  RecordingHandle,
  anEvent,
} from '../../../support/builders/session.builder';
import { StubEngine } from '../../../support/fakes/stub-engine';
import { RecordingBroadcaster } from '../../../support/fakes/recording-broadcaster';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { SequentialIds } from '../../../support/fakes/sequential-ids';
import { InMemoryResumableConversations } from '../../../support/fakes/in-memory-resumable-conversations';
import { InMemorySessionOriginRepository } from '../../../support/fakes/in-memory-session-origin.repository';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';

const owner = UserId.create('auth|owner');
const now = new Date('2026-09-18T12:00:00.000Z');

const defaults = { model: 'claude-sonnet-5', permissionMode: 'ask' } as const;

/** The engine of these tests: the port of ADR-025, recording what it was asked. */
class StubClaude extends StubEngine {}

describe('StartSessionUseCase', () => {
  let claude: StubClaude;
  let registry: SessionRegistry;
  let broadcaster: RecordingBroadcaster;
  let resolved: string[];
  let origins: InMemorySessionOriginRepository;
  let conversations: InMemoryResumableConversations;
  let trail: RecordingAuditEvents;

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

  let clock: FixedClock;

  beforeEach(() => {
    clock = new FixedClock(now);
    claude = new StubClaude();
    registry = new SessionRegistry(2, aClock());
    broadcaster = new RecordingBroadcaster();
    resolved = [];
    ids = new SequentialIds();
    origins = new InMemorySessionOriginRepository();
    conversations = new InMemoryResumableConversations();
    trail = new RecordingAuditEvents();
  });

  const build = (): StartSessionUseCase =>
    new StartSessionUseCase(
      workspaces,
      registry,
      new EngineRegistry([claude], 'claude'),
      broadcaster,
      clock,
      ids,
      defaults,
      { origins },
      {
        conversations,
        trail: new RecordAuditEventUseCase(trail, new SequentialIds('01J0AUD0000000000000000')),
      },
    );

  const start = async (workspacePath = '/srv/projects/app'): Promise<Session> =>
    (
      await build().execute({
        workspacePath,
        model: null,
        permissionMode: null,
        resumeFrom: null,
        userId: owner,
        openedFrom: 'web',
      })
    ).session;

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
    expect(session.permissionMode).toBe('ask');
  });

  it('opens with what the client asked for when it asked', async () => {
    const { session } = await build().execute({
      workspacePath: '/srv/projects/app',
      model: 'claude-opus-5',
      permissionMode: 'readOnly',
      resumeFrom: null,
      userId: owner,
      openedFrom: 'mobile',
    });

    expect(session.model).toBe('claude-opus-5');
    // Plan 08, B-07: the list of live sessions says which client opened each one.
    expect(session.openedFrom).toBe('mobile');
    expect(claude.starts[0]?.permissionMode).toBe('readOnly');
  });

  describe('the provenance — plan 04, S-71', () => {
    const FIRST = '00000000-0000-4000-8000-000000000001';

    it('records the conversation as ours, and hands the SDK that very id', async () => {
      const session = await start();

      expect(origins.rows.get(FIRST)).toMatchObject({
        sessionId: session.id,
        openedBy: owner,
        workspace: session.workspace,
        openedAt: now,
      });
      expect(
        claude.starts[0]?.conversation.ref.equals(ConversationRef.create('claude', FIRST)),
      ).toBe(true);
      expect(claude.starts[0]?.conversation.resumedFrom).toBeNull();
    });

    it('records it before anything is spawned', async () => {
      // Written after the fact, it would leave a window in which a transcript of ours is on disk
      // and reads as somebody else's.
      let recordedFirst = false;
      const record = origins.record.bind(origins);
      origins.record = (origin) => {
        recordedFirst = claude.starts.length === 0;
        return record(origin);
      };

      await start();

      expect(recordedFirst).toBe(true);
    });

    it('opens nothing when the provenance cannot be recorded, and gives the slot back', async () => {
      // A session whose origin is lost would read as somebody else's for the rest of its life —
      // and a resume would fork it, or worse, treat another person's as free to continue.
      origins.failWith = new Error('the database is gone');

      await expect(start()).rejects.toThrow('the database is gone');
      expect(claude.starts).toEqual([]);
      expect(registry.size).toBe(0);
    });
  });

  describe('resuming a conversation — plan 04, F2', () => {
    /** One of ours, opened by the owner, and one begun in the editor. */
    const OURS = '0f0e0d0c-0b0a-4908-8706-050403020100';
    const EDITOR = '1f1e1d1c-1b1a-4918-9716-151413121110';
    const FIRST = '00000000-0000-4000-8000-000000000001';

    // One instance, as Nest holds one: the resumes in flight are the use case's to remember.
    let useCase: StartSessionUseCase;

    const resume = (
      resumeSessionId: string,
      overrides: { workspacePath?: string; userId?: UserId } = {},
    ): ReturnType<StartSessionUseCase['execute']> =>
      useCase.execute({
        workspacePath: overrides.workspacePath ?? '/srv/projects/app',
        model: null,
        permissionMode: null,
        resumeFrom: { engine: 'claude', id: resumeSessionId },
        userId: overrides.userId ?? owner,
        openedFrom: 'web',
      });

    beforeEach(() => {
      useCase = build();
      conversations.add({ id: OURS, openedBy: owner.value }).add({ id: EDITOR });
    });

    it('continues one of ours in place, under the id it has — S-19, S-59', async () => {
      const started = await resume(OURS);

      expect(started.joined).toBe(false);
      expect(started.conversation.ref.id).toBe(OURS);
      expect(started.conversation.resumedFrom?.id).toBe(OURS);
      expect(claude.starts[0]?.conversation).toEqual(started.conversation);
      // In place writes nothing new about where it came from: it was recorded when it was opened.
      expect(origins.rows.size).toBe(0);
    });

    it('forks one begun elsewhere under a new id of ours, recorded first — S-20, S-58', async () => {
      let recordedBeforeSpawn = false;
      const record = origins.record.bind(origins);
      origins.record = (origin) => {
        recordedBeforeSpawn = claude.starts.length === 0;
        return record(origin);
      };

      const started = await resume(EDITOR);

      expect(started.conversation.ref.id).toBe(FIRST);
      expect(started.conversation.resumedFrom?.id).toBe(EDITOR);
      expect(origins.rows.get(FIRST)?.openedBy).toEqual(owner);
      expect(recordedBeforeSpawn).toBe(true);
      // Nothing about the original is claimed as ours: it stays the editor's.
      expect(origins.rows.has(EDITOR)).toBe(false);
    });

    it('is a new live session, with a new id of its own — S-21', async () => {
      const first = await resume(OURS);
      claude.starts[0]?.onClosed('completed');

      const second = await resume(OURS);

      expect(second.session.id.equals(first.session.id)).toBe(false);
    });

    it('writes the resume to the trail, before anything is spawned — S-27', async () => {
      // How many subprocesses existed when each entry was written: none of this resume's own.
      const spawnedWhenTrailed: number[] = [];
      const append = trail.append.bind(trail);
      trail.append = (event) => {
        spawnedWhenTrailed.push(claude.starts.length);
        return append(event);
      };

      await resume(OURS);
      claude.starts[0]?.onClosed('completed');
      await resume(EDITOR);

      expect(trail.kinds).toEqual(['session.resumed', 'session.forked']);
      expect(trail.appended[0]?.snapshot()).toMatchObject({
        userId: owner,
        subjectId: OURS,
        subjectLabel: '/srv/projects/app',
        at: now,
      });
      expect(spawnedWhenTrailed).toEqual([0, 1]);
    });

    it('does not resume when the trail cannot take it, and gives the slot back', async () => {
      trail.failure = new Error('the trail is gone');

      await expect(resume(OURS)).rejects.toThrow('the trail is gone');
      expect(claude.starts).toEqual([]);
      expect(registry.size).toBe(0);
    });

    it('refuses a conversation that does not exist — S-22', async () => {
      await expect(resume('2f2e2d2c-2b2a-4928-a726-252423222120')).rejects.toThrow(
        SessionNotFoundError,
      );
      expect(claude.starts).toEqual([]);
    });

    it("refuses somebody else's with the answer an absent one gets", async () => {
      conversations.add({ id: OURS, openedBy: 'auth|somebody-else' });

      await expect(resume(OURS)).rejects.toThrow(SessionNotFoundError);
      expect(claude.starts).toEqual([]);
    });

    it('refuses one that ran in another workspace, or recorded none', async () => {
      conversations.add({ id: OURS, cwd: '/srv/projects/other', openedBy: owner.value });
      conversations.add({ id: EDITOR, cwd: null });

      await expect(resume(OURS)).rejects.toThrow(SessionNotFoundError);
      await expect(resume(EDITOR)).rejects.toThrow(SessionNotFoundError);
    });

    it('refuses a workspace that left the allowlist before asking the store — S-23', async () => {
      await expect(resume(OURS, { workspacePath: '/etc' })).rejects.toThrow(
        WorkspaceNotAllowedError,
      );
      expect(conversations.lookups).toBe(0);
    });

    it('refuses an id that is not a conversation id before asking the store', async () => {
      await expect(resume('sdk-1')).rejects.toThrow(InvalidConversationRefError);
      expect(conversations.lookups).toBe(0);
    });

    it('refuses the resume beyond the limit, and spawns nothing — S-26', async () => {
      await start();
      await start();

      await expect(resume(OURS)).rejects.toThrow(SessionLimitReachedError);
      expect(claude.starts).toHaveLength(2);
    });

    it('joins what is already live instead of spawning it again — S-24', async () => {
      const first = await resume(OURS);
      const second = await resume(OURS);

      expect(second.joined).toBe(true);
      expect(second.session).toBe(first.session);
      expect(claude.starts).toHaveLength(1);
      expect(trail.kinds).toEqual(['session.resumed']);
    });

    it('joins a live session of ours that was opened here, not resumed', async () => {
      const opened = await start();
      const conversation = claude.starts[0]?.conversation.ref.id ?? '';
      conversations.add({ id: conversation, openedBy: owner.value });

      const again = await resume(conversation);

      expect(again).toMatchObject({ joined: true, session: opened });
      expect(claude.starts).toHaveLength(1);
    });

    it('joins the live fork when the conversation begun elsewhere is resumed again', async () => {
      await resume(EDITOR);
      const again = await resume(EDITOR);

      expect(again.joined).toBe(true);
      expect(claude.starts).toHaveLength(1);
    });

    it('makes two resumes arriving together one `query()` — S-25', async () => {
      const [first, second] = await Promise.all([resume(OURS), resume(OURS)]);

      expect(claude.starts).toHaveLength(1);
      expect(second.session).toBe(first.session);
      expect([first.joined, second.joined].sort()).toEqual([false, true]);
    });

    it('lets the next resume try again once one that was in flight failed', async () => {
      claude.failWith = new Error('spawn failed');
      await expect(resume(OURS)).rejects.toThrow('spawn failed');

      claude.failWith = null;

      await expect(resume(OURS)).resolves.toMatchObject({ joined: false });
    });

    it("gives another person's resume of the editor's conversation a fork of their own", async () => {
      const stranger = UserId.create('auth|stranger');
      await resume(EDITOR);

      const theirs = await resume(EDITOR, { userId: stranger });

      expect(theirs.joined).toBe(false);
      expect(claude.starts).toHaveLength(2);
    });

    it('fails like the store does when the SDK is down, and spawns nothing', async () => {
      conversations.failWith = new Error('the SDK is down');

      await expect(resume(OURS)).rejects.toThrow('the SDK is down');
      expect(claude.starts).toEqual([]);
      expect(registry.size).toBe(0);
    });
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
    it('counts every event of Claude as activity, for the idle clock — plan 05, D-02', async () => {
      const session = await start();
      clock.advance(90_000);

      claude.emit(anEvent('message.delta', { messageId: 'm1', delta: 'hi' }));

      expect(session.lastActivityAt).toEqual(clock.now());
    });

    it('publishes every event to whoever is watching', async () => {
      await start();
      claude.emit(anEvent('message.delta', { messageId: 'm1', delta: 'hi' }));

      expect(broadcaster.types).toContain('message.delta');
    });

    it('moves the machine and announces the new status', async () => {
      const session = await start();
      claude.emit(anEvent('message.delta', { messageId: 'm1', delta: 'hi' }));

      expect(session.status).toBe('thinking');
      expect(broadcaster.types).toEqual(['message.delta', 'session.statusChanged']);
    });

    it('says nothing about a status that did not change', async () => {
      await start();
      broadcaster.events.length = 0;

      claude.emit(anEvent('turn.completed'));

      // `turn.completed` means `idle`, and a session whose subprocess is up already was.
      expect(broadcaster.types).toEqual(['turn.completed']);
    });

    it('reaches `waitingPermission`, which is the one the UI cannot guess', async () => {
      const session = await start();
      claude.emit(anEvent('message.delta'));
      claude.emit(anEvent('permission.requested'));

      expect(session.status).toBe('waitingPermission');
    });

    it('publishes an event that implies no status without touching the machine', async () => {
      const session = await start();

      claude.emit(anEvent('diag.pong'));

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

      expect((broadcaster.errors.at(-1)?.error as { code: string }).code).toBe('AGENT_UNAVAILABLE');
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

  describe('the queue of prompts — plan 08, D-14', () => {
    it('sends the next prompt as its own turn when the turn ends, and says it left the queue — S-160', async () => {
      const session = await start();
      session.prompts.submit({ queueId: 'q1', text: 'first', promptedBy: 'web', preview: 'first' });
      session.prompts.submit({
        queueId: 'q2',
        text: 'second',
        promptedBy: 'mobile',
        preview: 'second',
      });

      claude.emit(anEvent('turn.completed'));

      expect(claude.handle.prompts).toEqual(['second']);
      // It left the queue, and then it is said, as the prompt of the turn it opens — by its sender.
      expect(broadcaster.events.slice(-2).map((entry) => entry.event)).toEqual([
        anEvent('prompt.dequeued', { queueId: 'q2', reason: 'started' }),
        {
          type: 'message.completed',
          payload: {
            messageId: 'prompt-1',
            role: 'user',
            content: [{ type: 'text', blockId: 'prompt-1:0', text: 'second' }],
            promptedBy: 'mobile',
          },
        },
      ]);

      claude.emit(anEvent('turn.completed'));
      expect(claude.handle.prompts).toEqual(['second']);
      expect(session.prompts.turnOpen).toBe(false);
    });

    it('sends nothing when the session went before its turn ended', async () => {
      const session = await start();
      session.prompts.submit({ queueId: 'q1', text: 'first', promptedBy: 'web', preview: 'first' });
      session.prompts.submit({
        queueId: 'q2',
        text: 'second',
        promptedBy: 'web',
        preview: 'second',
      });
      registry.remove(session.id);

      claude.emit(anEvent('turn.completed'));

      expect(claude.handle.prompts).toEqual([]);
    });
  });

  describe('the configuration of the owner — plan 13, B-15', () => {
    const asked: Parameters<SessionConfigurationSource['configurationFor']>[0][] = [];
    const configured: SessionConfigurationSource = {
      configurationFor: (query) => {
        asked.push(query);
        return Promise.resolve({
          model: query.client.model ?? 'claude-opus-5',
          permissionMode: query.client.permissionMode ?? 'readOnly',
          effort: 'high',
          thinking: 'off',
          outputStyle: 'Concise',
          fallbackModel: 'claude-sonnet-5',
          defaultsFrom: query.client.model === null ? 'folder' : 'client',
        });
      },
    };
    const withConfiguration = () =>
      new StartSessionUseCase(
        workspaces,
        registry,
        new EngineRegistry([claude], 'claude'),
        broadcaster,
        clock,
        ids,
        defaults,
        { origins },
        { conversations, trail: new RecordAuditEventUseCase(trail, new SequentialIds()) },
        null,
        configured,
      );

    beforeEach(() => {
      asked.length = 0;
    });

    it('opens with what the owner configured, and says what it applied', async () => {
      const started = await withConfiguration().execute({
        workspacePath: '/srv/projects/app',
        model: null,
        permissionMode: null,
        resumeFrom: null,
        userId: owner,
        openedFrom: 'web',
      });

      expect(started.session.model).toBe('claude-opus-5');
      expect(started.session.permissionMode).toBe('readOnly');
      expect(claude.starts[0]).toMatchObject({
        model: 'claude-opus-5',
        effort: 'high',
        thinking: 'off',
        outputStyle: 'Concise',
        fallbackModel: 'claude-sonnet-5',
      });
      expect(started.applied).toEqual({
        effort: 'high',
        outputStyle: 'Concise',
        defaultsFrom: 'folder',
      });
      expect(asked[0]).toMatchObject({
        client: { model: null, permissionMode: null, effort: null },
        models: null,
      });
    });

    it('applies the defaults to a resume as to a new session — S-52', async () => {
      conversations.add({ id: '0f0e0d0c-0b0a-4908-8706-050403020100', openedBy: owner.value });

      const started = await withConfiguration().execute({
        workspacePath: '/srv/projects/app',
        model: 'claude-haiku-5',
        permissionMode: null,
        resumeFrom: { engine: 'claude', id: '0f0e0d0c-0b0a-4908-8706-050403020100' },
        userId: owner,
        openedFrom: 'web',
      });

      expect(started.conversation.resumedFrom?.id).toBe('0f0e0d0c-0b0a-4908-8706-050403020100');
      expect(claude.starts[0]).toMatchObject({
        model: 'claude-haiku-5',
        thinking: 'off',
        outputStyle: 'Concise',
      });
      expect(started.applied.defaultsFrom).toBe('client');
    });

    it('asks nothing when no configuration is wired: the client’s choice, as before — S-49', async () => {
      const started = await build().execute({
        workspacePath: '/srv/projects/app',
        model: 'claude-sonnet-5',
        permissionMode: null,
        resumeFrom: null,
        userId: owner,
        openedFrom: 'web',
      });

      expect(started.applied).toEqual({ effort: null, outputStyle: null, defaultsFrom: 'client' });
      expect(claude.starts[0]).toMatchObject({
        thinking: null,
        outputStyle: null,
        fallbackModel: null,
      });
    });
  });

  describe('effort — D-16', () => {
    const effortOf = async (effort: 'low' | 'max', models: ModelCatalog | null) =>
      new StartSessionUseCase(
        workspaces,
        registry,
        new EngineRegistry([claude], 'claude'),
        broadcaster,
        clock,
        ids,
        defaults,
        { origins },
        { conversations, trail: new RecordAuditEventUseCase(trail, new SequentialIds()) },
        models,
      ).execute({
        workspacePath: '/srv/projects/app',
        model: null,
        permissionMode: null,
        resumeFrom: null,
        effort,
        userId: owner,
        openedFrom: 'web',
      });

    it('opens the session with the effort chosen in the draft', async () => {
      await effortOf('low', null);

      expect(claude.starts[0]?.effort).toBe('low');
    });

    it('refuses an effort the model is known not to take, before anything is spawned — S-171', async () => {
      const catalog = new ModelCatalog();
      const handle = new RecordingHandle();
      handle.cliVersion = '2.1.277';
      handle.offered = [
        {
          value: 'claude-sonnet-5',
          resolvedModel: null,
          displayName: 'Sonnet',
          description: '',
          supportedEffortLevels: ['low'],
        },
      ];
      await catalog.modelsOf({
        session: await start(),
        handle,
        conversation: {
          ref: ConversationRef.create('claude', '6b41b192-a41b-46c2-b8d7-5098d8c825be'),
          resumedFrom: null,
        },
      });
      const before = claude.starts.length;

      await expect(effortOf('max', catalog)).rejects.toThrow(EffortUnsupportedError);
      expect(claude.starts).toHaveLength(before);
      await expect(effortOf('low', catalog)).resolves.toBeDefined();
    });

    describe('the levels the engine announces — plan 28, S-84', () => {
      const launch = (overrides: Partial<StartSessionCommand>) =>
        build().execute({
          workspacePath: '/srv/projects/app',
          model: null,
          permissionMode: null,
          resumeFrom: null,
          userId: owner,
          openedFrom: 'web',
          ...overrides,
        });

      it('refuses a level the engine does not announce, before anything is spawned', async () => {
        claude.capabilities = { ...ALL_CAPABILITIES, effortLevels: ['low', 'medium', 'high'] };

        const refusal = await launch({ effort: 'max' }).catch((error: unknown) => error);

        expect(refusal).toBeInstanceOf(EffortUnsupportedError);
        expect(refusal).toMatchObject({
          code: 'INVALID_INPUT',
          messageKey: 'session.error.effortUnsupported',
          params: { level: 'max', model: 'claude-sonnet-5' },
        });
        expect(claude.starts).toEqual([]);
      });

      it('names the model the client chose in the refusal', async () => {
        claude.capabilities = { ...ALL_CAPABILITIES, effortLevels: ['low'] };

        await expect(launch({ effort: 'high', model: 'claude-opus-5' })).rejects.toMatchObject({
          params: { level: 'high', model: 'claude-opus-5' },
        });
      });

      it('refuses every level of an engine that has no effort at all', async () => {
        claude.capabilities = { ...ALL_CAPABILITIES, effortLevels: [] };

        await expect(launch({ effort: 'low' })).rejects.toThrow(EffortUnsupportedError);
        expect(claude.starts).toEqual([]);
      });

      it('opens with no effort on an engine that has none', async () => {
        claude.capabilities = { ...ALL_CAPABILITIES, effortLevels: [] };

        await expect(launch({ effort: null })).resolves.toBeDefined();
        await expect(launch({})).resolves.toBeDefined();
      });

      it('opens with a level at the edge of what the engine announces', async () => {
        claude.capabilities = { ...ALL_CAPABILITIES, effortLevels: ['low', 'medium', 'high'] };

        await launch({ effort: 'high' });

        expect(claude.starts[0]?.effort).toBe('high');
      });

      it('reads the levels of the engine of the conversation it resumes', async () => {
        const other = new StubEngine('other-engine');
        other.capabilities = { ...ALL_CAPABILITIES, effortLevels: ['low'] };
        const across = new StartSessionUseCase(
          workspaces,
          registry,
          new EngineRegistry([claude, other], 'claude'),
          broadcaster,
          clock,
          ids,
          defaults,
          { origins },
          { conversations, trail: new RecordAuditEventUseCase(trail, new SequentialIds()) },
        );

        await expect(
          across.execute({
            workspacePath: '/srv/projects/app',
            model: null,
            permissionMode: null,
            resumeFrom: { engine: 'other-engine', id: '11111111-1111-4111-8111-111111111111' },
            effort: 'max',
            userId: owner,
            openedFrom: 'web',
          }),
        ).rejects.toThrow(EffortUnsupportedError);
        expect(other.starts).toEqual([]);
      });

      it('reads the levels of the engine the client named', async () => {
        const other = new StubEngine('other-engine');
        other.capabilities = { ...ALL_CAPABILITIES, effortLevels: ['low'] };
        const across = new StartSessionUseCase(
          workspaces,
          registry,
          new EngineRegistry([claude, other], 'claude'),
          broadcaster,
          clock,
          ids,
          defaults,
          { origins },
          { conversations, trail: new RecordAuditEventUseCase(trail, new SequentialIds()) },
        );
        const named = (effort: 'low' | 'max') =>
          across.execute({
            workspacePath: '/srv/projects/app',
            model: null,
            permissionMode: null,
            resumeFrom: null,
            engine: 'other-engine',
            effort,
            userId: owner,
            openedFrom: 'web',
          });

        await expect(named('max')).rejects.toThrow(EffortUnsupportedError);
        await expect(named('low')).resolves.toBeDefined();
        expect(other.starts).toHaveLength(1);
      });
    });
  });

  describe('edit and resend — D-19', () => {
    const CONVERSATION = '11111111-1111-4111-8111-111111111111';
    const fork = (forkAt: string) =>
      build().execute({
        workspacePath: '/srv/projects/app',
        model: null,
        permissionMode: null,
        resumeFrom: { engine: 'claude', id: CONVERSATION },
        forkAt,
        userId: owner,
        openedFrom: 'web',
      });

    beforeEach(() => {
      conversations.add({
        id: CONVERSATION,
        openedBy: owner.value,
        chain: [
          { id: 'u1', isPrompt: true },
          { id: 'a1', isPrompt: false },
          { id: 'u2', isPrompt: true },
        ],
      });
    });

    it('forks before the prompt, under a new id, and enters the trail — S-161', async () => {
      const started = await fork('u2');

      expect(started.conversation.resumedFrom?.id).toBe(CONVERSATION);
      expect(started.conversation.ref.key).not.toBe(CONVERSATION);
      expect(claude.starts[0]?.forkAt).toEqual({ keepUpTo: 'a1', dropsTurn: 'u2' });
      expect(trail.kinds).toContain('session.forked');
    });

    it('is a fresh conversation from the first prompt — S-165', async () => {
      const started = await fork('u1');

      expect(started.conversation.resumedFrom).toBeNull();
      expect(claude.starts[0]?.forkAt).toBeNull();
    });

    it('never joins the live session of the conversation: a fork is a new one', async () => {
      await build().execute({
        workspacePath: '/srv/projects/app',
        model: null,
        permissionMode: null,
        resumeFrom: { engine: 'claude', id: CONVERSATION },
        userId: owner,
        openedFrom: 'web',
      });

      expect((await fork('u2')).joined).toBe(false);
    });

    it('refuses a point that is not a prompt, and a conversation that is not there — S-163', async () => {
      await expect(fork('a1')).rejects.toThrow(ForkPointUnknownError);
      await expect(
        build().execute({
          workspacePath: '/srv/projects/app',
          model: null,
          permissionMode: null,
          resumeFrom: { engine: 'claude', id: '22222222-2222-4222-8222-222222222222' },
          forkAt: 'u1',
          userId: owner,
          openedFrom: 'web',
        }),
      ).rejects.toThrow(SessionNotFoundError);
      expect(claude.starts).toHaveLength(0);
    });

    it('says the CLI refused the point, once — S-164', async () => {
      const started = await fork('u2');

      claude.starts[0]?.onForkRejected?.();

      expect(broadcaster.errors).toEqual([
        {
          sessionId: started.session.id.value,
          error: expect.any(SessionForkRejectedError) as unknown,
        },
      ]);
    });
  });
});

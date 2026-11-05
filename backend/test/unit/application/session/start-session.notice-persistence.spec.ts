import { beforeEach, describe, expect, it } from 'vitest';

import { EngineRegistry, SessionRegistry, StartSessionUseCase } from '@application/session';
import { UserId } from '@domain/auth';
import type { Session } from '@domain/session';
import { WorkspacePath } from '@domain/workspace';
import { aClock, anEvent } from '../../../support/builders/session.builder';
import { StubEngine } from '../../../support/fakes/stub-engine';
import { RecordingBroadcaster } from '../../../support/fakes/recording-broadcaster';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { SequentialIds } from '../../../support/fakes/sequential-ids';
import { InMemoryResumableConversations } from '../../../support/fakes/in-memory-resumable-conversations';
import { InMemorySessionOriginRepository } from '../../../support/fakes/in-memory-session-origin.repository';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { FakeNoticeStore } from '../../../support/fakes/fake-notice-store';
import { RecordAuditEventUseCase } from '@application/audit';

const owner = UserId.create('auth|owner');
const now = new Date('2026-09-18T12:00:00.000Z');
const defaults = { models: { claude: 'claude-sonnet-5' }, permissionMode: 'ask' } as const;

/** The notice of this file's own scenarios — a hook's own warning, kind `agent.info` (D-10). */
const aNoticePayload = (noticeId: string) => ({
  noticeId,
  kind: 'agent.info',
  level: 'warning' as const,
  origin: { engine: 'claude', native: 'system:hook_response' },
  text: 'a hook failed',
});

describe('StartSessionUseCase — persisting a session.notice outside the transcript (Plan 27, F7, D-15)', () => {
  let claude: StubEngine;
  let registry: SessionRegistry;
  let broadcaster: RecordingBroadcaster;
  let origins: InMemorySessionOriginRepository;
  let conversations: InMemoryResumableConversations;
  let trail: RecordingAuditEvents;
  let notices: FakeNoticeStore;
  let ids: SequentialIds;
  let clock: FixedClock;

  beforeEach(() => {
    clock = new FixedClock(now);
    claude = new StubEngine();
    registry = new SessionRegistry(2, aClock());
    broadcaster = new RecordingBroadcaster();
    ids = new SequentialIds();
    origins = new InMemorySessionOriginRepository();
    conversations = new InMemoryResumableConversations();
    trail = new RecordingAuditEvents();
    notices = new FakeNoticeStore();
  });

  const build = (): StartSessionUseCase =>
    new StartSessionUseCase(
      { resolve: (path) => Promise.resolve(WorkspacePath.create(path)) },
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
      null,
      null,
      null,
      null,
      notices,
    );

  const start = async (): Promise<Session> =>
    (
      await build().execute({
        workspacePath: '/srv/projects/app',
        model: null,
        permissionMode: null,
        resumeFrom: null,
        userId: owner,
        openedFrom: 'web',
      })
    ).session;

  it('persists a session.notice emitted live, without delaying the event published to the client — S-115', async () => {
    const session = await start();
    const ref = registry.conversationOf(session.id)?.ref;
    expect(ref).not.toBeNull();

    claude.emit(anEvent('session.notice', aNoticePayload('n1')));

    expect(broadcaster.types).toContain('session.notice');
    const kept = await notices.listFor(ref!);
    expect(kept.map((notice) => notice.noticeId)).toEqual(['n1']);
  });

  it('never blocks or drops the published event when the store fails to record — S-116', async () => {
    notices.failRecord = true;
    const session = await start();
    const ref = registry.conversationOf(session.id)!.ref;

    expect(() => claude.emit(anEvent('session.notice', aNoticePayload('n1')))).not.toThrow();

    expect(broadcaster.types).toContain('session.notice');
    // The real failure, and its log line, are the store's own to produce (S-116) — this use case
    // only has to prove it never depends on the write succeeding.
    expect(await notices.listFor(ref)).toEqual([]);
  });

  it('never calls the store for a session that emits no session.notice at all — S-117', async () => {
    await start();

    claude.emit(anEvent('message.delta', { messageId: 'm1', delta: 'hi' }));
    claude.emit(anEvent('turn.completed'));

    expect(notices.recordCalls).toBe(0);
  });

  it('keeps a notice readable once its session is gone from the live registry — S-124', async () => {
    const session = await start();
    const ref = registry.conversationOf(session.id)!.ref;

    claude.emit(anEvent('session.notice', aNoticePayload('n1')));
    registry.remove(session.id);

    // The store never consults the registry — it is keyed only by the conversation, which
    // outlives whatever this process remembers of the session that ran it (B-29).
    expect(registry.conversationOf(session.id)).toBeNull();
    const kept = await notices.listFor(ref);
    expect(kept.map((notice) => notice.noticeId)).toEqual(['n1']);
  });
});

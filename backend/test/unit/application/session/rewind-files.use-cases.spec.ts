import { beforeEach, describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import {
  ListUndoPointsUseCase,
  MAX_UNDO_POINTS,
  RewindFilesUseCase,
  UndoPlanner,
} from '@application/session';
import type { SessionRegistry } from '@application/session';
import { UserId } from '@domain/auth';
import {
  RewindTargetUnknownError,
  SessionFileState,
  SessionForbiddenError,
  SessionId,
  SessionLockedError,
  SessionNotFoundError,
  TurnFileCheckpoint,
} from '@domain/session';
import type { Session, TurnFileCheckpointSnapshot } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import {
  aRegistry,
  aSession,
  CONVERSATION_ID,
  SESSION_ID,
} from '../../../support/builders/session.builder';
import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { FakeUndoDisk, InMemoryUndoJournal } from '../../../support/fakes/in-memory-undo';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const now = new Date('2026-09-26T12:30:00.000Z');
const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 26, 12, minute));

/** An earlier live session of the same conversation — one of ours, continued in place. */
const EARLIER = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY0');

function checkpoint(overrides: Partial<TurnFileCheckpointSnapshot> = {}): TurnFileCheckpoint {
  return TurnFileCheckpoint.capture({
    sessionId: SessionId.create(SESSION_ID),
    claudeSessionId: ClaudeSessionId.create(CONVERSATION_ID),
    promptId: 'p1',
    path: '/srv/projects/app/a.md',
    existedBefore: 'present',
    blobPath: '/store/blob-a',
    hash: 'a-before',
    sizeBytes: 3,
    restorable: 'yes',
    promptText: 'refactor the parser',
    capturedAt: at(0),
    ...overrides,
  });
}

function leftAs(path: string, hash: string | null, sessionId = SESSION_ID): SessionFileState {
  return SessionFileState.record({
    sessionId: SessionId.create(sessionId),
    claudeSessionId: ClaudeSessionId.create(CONVERSATION_ID),
    path,
    hash,
    mtime: at(5),
    sizeBytes: 3,
    updatedAt: at(5),
  });
}

describe('undoing what a session wrote', () => {
  let session: Session;
  let registry: SessionRegistry;
  let journal: InMemoryUndoJournal;
  let disk: FakeUndoDisk;
  let events: RecordingAuditEvents;
  let listing: ListUndoPointsUseCase;
  let rewind: RewindFilesUseCase;

  beforeEach(() => {
    session = aSession();
    session.observe('idle');
    registry = aRegistry([session]).registry;
    journal = new InMemoryUndoJournal();
    disk = new FakeUndoDisk();
    events = new RecordingAuditEvents();

    const clock = new FixedClock(now);
    const planner = new UndoPlanner(journal, disk, clock, new InMemoryPathLock());
    listing = new ListUndoPointsUseCase(registry, planner);
    rewind = new RewindFilesUseCase(
      registry,
      planner,
      new RecordAuditEventUseCase(events, new SequentialIds('01J0AUD0000000000000000')),
      clock,
    );

    // The session changed `a.md` and created `new.md`; `edited.md` it changed and somebody edited
    // afterwards by hand.
    journal.checkpoints.push(
      checkpoint(),
      checkpoint({ path: '/srv/projects/app/new.md', existedBefore: 'absent', hash: null }),
      checkpoint({ path: '/srv/projects/app/edited.md', hash: 'e-before' }),
    );
    journal.baselines.push(
      leftAs('/srv/projects/app/a.md', 'a-after'),
      leftAs('/srv/projects/app/new.md', 'n-after'),
      leftAs('/srv/projects/app/edited.md', 'e-after'),
    );
    disk.files.set('/srv/projects/app/a.md', { kind: 'file', hash: 'a-after' });
    disk.files.set('/srv/projects/app/new.md', { kind: 'file', hash: 'n-after' });
    disk.files.set('/srv/projects/app/edited.md', { kind: 'file', hash: 'by hand' });
  });

  const command = { sessionId: SESSION_ID, promptId: 'p1', userId: owner };

  describe('the preview', () => {
    it('says which files go back, which stay and why, and to which point — S-38', async () => {
      const [point] = await listing.execute(SESSION_ID, owner);

      expect(point).toEqual({
        promptId: 'p1',
        label: 'refactor the parser',
        at: at(0),
        files: [
          { path: '/srv/projects/app/a.md', outcome: 'revert', action: 'restore' },
          { path: '/srv/projects/app/edited.md', outcome: 'preserve', reason: 'modifiedOutside' },
          { path: '/srv/projects/app/new.md', outcome: 'revert', action: 'delete' },
        ],
      });
    });

    it('is empty for a session that wrote nothing — fron', async () => {
      journal.checkpoints.length = 0;

      expect(await listing.execute(SESSION_ID, owner)).toEqual([]);
    });

    it('answers at most the newest points, and looks at each path once — fron', async () => {
      journal.checkpoints.length = 0;
      for (let turn = 0; turn < MAX_UNDO_POINTS + 5; turn += 1) {
        journal.checkpoints.push(
          checkpoint({
            promptId: `p${String(turn)}`,
            capturedAt: new Date(at(0).getTime() + turn),
          }),
        );
      }

      const points = await listing.execute(SESSION_ID, owner);

      expect(points).toHaveLength(MAX_UNDO_POINTS);
      expect(points[0]?.promptId).toBe(`p${String(MAX_UNDO_POINTS + 4)}`);
      expect(disk.observed).toBe(1);
    });

    it('reaches the earlier sessions of a conversation continued in place — S-59', async () => {
      journal.checkpoints.push(
        checkpoint({ sessionId: EARLIER, promptId: 'earlier', capturedAt: at(-30) }),
      );

      const points = await listing.execute(SESSION_ID, owner);

      expect(points.map((point) => point.promptId)).toEqual(['p1', 'earlier']);
    });

    it('never reaches another conversation', async () => {
      journal.checkpoints.push(
        checkpoint({
          sessionId: EARLIER,
          claudeSessionId: ClaudeSessionId.create('1f1e1d1c-1b1a-4918-9716-151413121110'),
          promptId: 'theirs',
        }),
      );

      const points = await listing.execute(SESSION_ID, owner);

      expect(points.map((point) => point.promptId)).toEqual(['p1']);
    });

    it("refuses somebody else's session, and one that is not running — S-39", async () => {
      await expect(listing.execute(SESSION_ID, stranger)).rejects.toThrow(SessionForbiddenError);
      await expect(listing.execute('01J0ZZZZZZZZZZZZZZZZZZZZZZ', owner)).rejects.toThrow(
        SessionNotFoundError,
      );
    });
  });

  describe('the undo', () => {
    it('puts the files back, deletes what the turn created, and preserves the edited — S-37, S-63', async () => {
      const outcome = await rewind.execute(command);

      expect(outcome).toEqual({
        promptId: 'p1',
        reverted: [
          { path: '/srv/projects/app/a.md', action: 'restored' },
          { path: '/srv/projects/app/new.md', action: 'deleted' },
        ],
        preserved: [{ path: '/srv/projects/app/edited.md', reason: 'modifiedOutside' }],
        unchanged: [],
        failed: [],
      });
      expect(disk.restored).toEqual(['/srv/projects/app/a.md']);
      expect(disk.removed).toEqual(['/srv/projects/app/new.md']);
    });

    it('records how it left each path, as the session', async () => {
      await rewind.execute(command);

      expect(
        journal.recorded.map((state) => [state.sessionId.value, state.path, state.hash]),
      ).toEqual([
        [SESSION_ID, '/srv/projects/app/a.md', 'a-before'],
        [SESSION_ID, '/srv/projects/app/new.md', null],
      ]);
    });

    it('is idempotent: a second undo to the same point finds everything there — S-41', async () => {
      await rewind.execute(command);
      const again = await rewind.execute(command);

      expect(again.reverted).toEqual([]);
      expect(again.unchanged.map((file) => file.path)).toEqual([
        '/srv/projects/app/a.md',
        '/srv/projects/app/new.md',
      ]);
      expect(disk.restored).toHaveLength(1);
    });

    it('reaches only what the session touched — S-40', async () => {
      disk.files.set('/srv/projects/app/untouched.md', { kind: 'file', hash: 'mine' });

      const outcome = await rewind.execute(command);
      const paths = [
        ...outcome.reverted,
        ...outcome.preserved,
        ...outcome.unchanged,
        ...outcome.failed,
      ].map((file) => file.path);

      expect(paths).not.toContain('/srv/projects/app/untouched.md');
      expect(disk.files.get('/srv/projects/app/untouched.md')).toEqual({
        kind: 'file',
        hash: 'mine',
      });
    });

    it('enters the trail first, with the point and every path — S-42', async () => {
      await rewind.execute(command);

      const [event] = events.appended;
      expect(event?.snapshot()).toMatchObject({
        kind: 'session.filesRewound',
        subjectId: 'p1',
        subjectLabel: '/srv/projects/app',
        userId: owner,
        at: now,
        details: {
          sessionId: SESSION_ID,
          claudeSessionId: CONVERSATION_ID,
          files: [
            { path: '/srv/projects/app/a.md', outcome: 'revert', action: 'restore' },
            {
              path: '/srv/projects/app/edited.md',
              outcome: 'preserve',
              reason: 'modifiedOutside',
            },
            { path: '/srv/projects/app/new.md', outcome: 'revert', action: 'delete' },
          ],
        },
      });
    });

    it('touches nothing when the trail cannot take it — S-42', async () => {
      events.failure = new Error('the trail is down');

      await expect(rewind.execute(command)).rejects.toThrow('the trail is down');
      expect(disk.restored).toEqual([]);
      expect(disk.removed).toEqual([]);
    });

    it('reports what did not go back, and still puts back the rest — S-44, S-62', async () => {
      disk.failing.add('/srv/projects/app/a.md');

      const outcome = await rewind.execute(command);

      expect(outcome.failed).toEqual([{ path: '/srv/projects/app/a.md' }]);
      expect(outcome.reverted).toEqual([{ path: '/srv/projects/app/new.md', action: 'deleted' }]);
      expect(journal.recorded.map((state) => state.path)).toEqual(['/srv/projects/app/new.md']);
    });

    it('reports a created file that could not be removed as failed', async () => {
      disk.failing.add('/srv/projects/app/new.md');

      const outcome = await rewind.execute(command);

      expect(outcome.failed).toEqual([{ path: '/srv/projects/app/new.md' }]);
    });

    it.each(['thinking', 'running', 'waitingPermission'] as const)(
      'refuses while the session is %s — S-43',
      async (status) => {
        session.observe('thinking');
        session.observe(status);

        await expect(rewind.execute(command)).rejects.toThrow(SessionLockedError);
        await expect(rewind.execute(command)).rejects.toMatchObject({
          code: 'SESSION_LOCKED',
          messageKey: 'session.error.locked',
          params: { reason: 'turnRunning' },
        });
        expect(events.appended).toEqual([]);
      },
    );

    it('refuses a second undo of the session while the first is in progress — conc', async () => {
      let release = (): void => undefined;
      disk.held = new Promise<void>((resolve) => {
        release = resolve;
      });

      const first = rewind.execute(command);
      await expect(rewind.execute(command)).rejects.toMatchObject({
        params: { reason: 'rewindRunning' },
      });
      release();
      await first;

      // Once the first is done, the next one is welcome.
      await expect(rewind.execute(command)).resolves.toBeDefined();
    });

    it('refuses a point that is not one of the session — S-61', async () => {
      await expect(rewind.execute({ ...command, promptId: 'nope' })).rejects.toThrow(
        RewindTargetUnknownError,
      );
      expect(events.appended).toEqual([]);
    });

    it('refuses a session that ended, and one that is somebody else’s — S-39', async () => {
      await expect(rewind.execute({ ...command, userId: stranger })).rejects.toThrow(
        SessionForbiddenError,
      );

      registry.remove(session.id);
      await expect(rewind.execute(command)).rejects.toThrow(SessionNotFoundError);
    });
  });
});

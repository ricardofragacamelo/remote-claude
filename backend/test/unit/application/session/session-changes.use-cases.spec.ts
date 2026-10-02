import { beforeEach, describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import {
  ListSessionChangesUseCase,
  ReadSessionChangeUseCase,
  RejectChangeUseCase,
  RestoreChangeUseCase,
  RewindFilesUseCase,
  SessionChangeMemory,
  ShowToolDiffUseCase,
  UndoPlanner,
} from '@application/session';
import type { ChangeStores, ChangeWriting, SessionRegistry } from '@application/session';
import { UserId } from '@domain/auth';
import { FileNotTextError } from '@domain/files';
import {
  DiffNotApplicableError,
  RewindPathUnknownError,
  SessionChangeNotFoundError,
  SessionChangeStaleError,
  SessionFileState,
  SessionForbiddenError,
  SessionId,
  SessionLockedError,
  SessionNotFoundError,
  ToolUseNotFoundError,
  TurnFileCheckpoint,
} from '@domain/session';
import type { Session, TurnFileCheckpointSnapshot } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import { WorkspaceNotAllowedError } from '@domain/workspace';
import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';
import {
  aRegistry,
  aSession,
  CONVERSATION_ID,
  SESSION_ID,
} from '../../../support/builders/session.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { FakeUndoDisk, hashOf, InMemoryUndoJournal } from '../../../support/fakes/in-memory-undo';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const now = new Date('2026-10-01T12:30:00.000Z');

const APP = '/srv/projects/app/app.js';
const NEW = '/srv/projects/app/new.txt';
const GONE = '/srv/projects/app/gone.txt';
const EDITED = '/srv/projects/app/edited.txt';

const BEFORE = "const greeting = 'hello';\nconsole.log(greeting);\nexport {};\n";
const AFTER = "const greeting = 'hi';\nconsole.info(greeting);\nexport {};\n";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function checkpoint(overrides: Partial<TurnFileCheckpointSnapshot> = {}): TurnFileCheckpoint {
  return TurnFileCheckpoint.capture({
    sessionId: SessionId.create(SESSION_ID),
    claudeSessionId: ClaudeSessionId.create(CONVERSATION_ID),
    promptId: 'p1',
    path: APP,
    existedBefore: 'present',
    blobPath: `/store${overrides.path ?? APP}`,
    hash: hashOf(BEFORE),
    sizeBytes: BEFORE.length,
    restorable: 'yes',
    promptText: 'tidy the greeting',
    capturedAt: new Date('2026-10-01T12:00:00.000Z'),
    ...overrides,
  });
}

function leftAs(path: string, hash: string | null): SessionFileState {
  return SessionFileState.record({
    sessionId: SessionId.create(SESSION_ID),
    claudeSessionId: ClaudeSessionId.create(CONVERSATION_ID),
    path,
    hash,
    mtime: now,
    sizeBytes: 1,
    updatedAt: new Date('2026-10-01T12:05:00.000Z'),
  });
}

describe('what a session changed on disk', () => {
  let session: Session;
  let registry: SessionRegistry;
  let journal: InMemoryUndoJournal;
  let disk: FakeUndoDisk;
  let events: RecordingAuditEvents;
  let memory: SessionChangeMemory;
  let stores: ChangeStores;
  let writing: ChangeWriting;

  beforeEach(() => {
    session = aSession();
    session.observe('idle');
    registry = aRegistry([session]).registry;
    journal = new InMemoryUndoJournal();
    disk = new FakeUndoDisk();
    events = new RecordingAuditEvents();
    memory = new SessionChangeMemory();
    stores = { journal, disk, limits: { maxFileBytes: 10_000 } };
    writing = {
      lock: new InMemoryPathLock(),
      trail: new RecordAuditEventUseCase(events, new SequentialIds('01J0AUD0000000000000000')),
      clock: new FixedClock(now),
    };
  });

  /** The session edited `app.js`, and the disk is still what it left. */
  function edited(after = AFTER): void {
    journal.checkpoints.push(checkpoint());
    disk.snapshots.set(`/store${APP}`, encode(BEFORE));
    journal.baselines.push(leftAs(APP, disk.put(APP, after)));
  }

  const remember = (toolUseId: string, toolName: string, input: Record<string, unknown>) => {
    memory.rememberTool(session, { toolUseId, toolName, input, promptId: 'p1' });
  };

  describe('the diff of a tool — B-25', () => {
    let diff: ShowToolDiffUseCase;

    beforeEach(() => {
      diff = new ShowToolDiffUseCase(registry, memory, stores);
    });

    it('of an edit, is the whole file against the snapshot of its turn — S-103', async () => {
      edited();
      remember('toolu_1', 'Edit', { file_path: APP, old_string: "'hello'", new_string: "'hi'" });

      const shown = await diff.execute(SESSION_ID, 'toolu_1', owner);

      expect(shown).toMatchObject({
        path: APP,
        scope: 'file',
        before: { state: 'content', content: BEFORE },
        after: { state: 'content', content: AFTER },
      });
      expect(shown.hunks).toHaveLength(1);
    });

    it('of an edit whose file was changed since by hand, is the edit only', async () => {
      edited();
      disk.put(APP, 'by hand\n');
      remember('toolu_1', 'Edit', { file_path: APP, old_string: "'hello'", new_string: "'hi'" });

      const shown = await diff.execute(SESSION_ID, 'toolu_1', owner);

      expect(shown).toMatchObject({
        scope: 'edit',
        after: { state: 'unavailable', reason: 'changedSince' },
      });
    });

    it('of an edit whose file is gone, says the after is not known', async () => {
      edited();
      disk.files.set(APP, { kind: 'absent' });
      remember('toolu_1', 'Edit', { file_path: APP, old_string: 'a', new_string: 'b' });

      expect((await diff.execute(SESSION_ID, 'toolu_1', owner)).after).toEqual({
        state: 'unavailable',
        reason: 'changedSince',
      });
    });

    it('of a write of a new file, is all added, without reading the disk — S-105', async () => {
      journal.checkpoints.push(checkpoint({ path: NEW, existedBefore: 'absent', hash: null }));
      remember('toolu_1', 'Write', { file_path: NEW, content: 'done\n' });

      const shown = await diff.execute(SESSION_ID, 'toolu_1', owner);

      expect(shown).toMatchObject({ before: { state: 'absent' }, scope: 'file' });
      expect(shown.hunks[0]?.lines).toEqual([{ kind: 'added', text: 'done' }]);
    });

    it('of a write with no snapshot, or one gone from the store, says which — S-107', async () => {
      remember('toolu_1', 'Write', { file_path: APP, content: 'x' });
      expect((await diff.execute(SESSION_ID, 'toolu_1', owner)).before).toEqual({
        state: 'unavailable',
        reason: 'noSnapshot',
      });

      journal.checkpoints.push(checkpoint());
      expect((await diff.execute(SESSION_ID, 'toolu_1', owner)).before).toEqual({
        state: 'notRestorable',
        reason: 'unreadable',
      });

      journal.checkpoints.length = 0;
      journal.checkpoints.push(checkpoint({ restorable: 'tooLarge', hash: null, blobPath: null }));
      expect((await diff.execute(SESSION_ID, 'toolu_1', owner)).before).toEqual({
        state: 'notRestorable',
        reason: 'tooLarge',
      });
    });

    it('refuses a tool the session does not have — S-108', async () => {
      await expect(diff.execute(SESSION_ID, 'toolu_none', owner)).rejects.toBeInstanceOf(
        ToolUseNotFoundError,
      );
    });

    it('refuses a tool that writes no file, or names none it can find — S-109', async () => {
      remember('toolu_1', 'Bash', { command: 'ls' });
      remember('toolu_2', 'Edit', { file_path: 'relative.js' });

      await expect(diff.execute(SESSION_ID, 'toolu_1', owner)).rejects.toBeInstanceOf(
        DiffNotApplicableError,
      );
      await expect(diff.execute(SESSION_ID, 'toolu_2', owner)).rejects.toBeInstanceOf(
        DiffNotApplicableError,
      );
    });

    it("refuses somebody else's session, and one that is not live — S-110", async () => {
      await expect(diff.execute(SESSION_ID, 'toolu_1', stranger)).rejects.toBeInstanceOf(
        SessionForbiddenError,
      );
      await expect(
        diff.execute('01J0ABCDEFGHJKMNPQRSTVWXY1', 'toolu_1', owner),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
    });

    it('refuses a side that is binary, or not UTF-8 — S-111', async () => {
      journal.checkpoints.push(checkpoint());
      remember('toolu_1', 'Write', { file_path: APP, content: 'x' });

      disk.snapshots.set(`/store${APP}`, Uint8Array.from([0x61, 0x00, 0x62]));
      await expect(diff.execute(SESSION_ID, 'toolu_1', owner)).rejects.toMatchObject({
        code: 'FILE_NOT_TEXT',
        params: { reason: 'binary' },
      });

      disk.snapshots.set(`/store${APP}`, Uint8Array.from([0xff, 0xfe, 0x41]));
      await expect(diff.execute(SESSION_ID, 'toolu_1', owner)).rejects.toBeInstanceOf(
        FileNotTextError,
      );
    });
  });

  describe('the list of changes — B-26', () => {
    let list: ListSessionChangesUseCase;

    beforeEach(() => {
      list = new ListSessionChangesUseCase(registry, stores);
    });

    it('is empty for a session that changed nothing — S-115', async () => {
      expect(await list.execute(SESSION_ID, owner)).toEqual({ promptId: null, files: [] });
    });

    it('lists each file created, modified and deleted, with how many lines — S-113', async () => {
      edited();
      journal.checkpoints.push(
        checkpoint({ path: NEW, existedBefore: 'absent', hash: null, promptId: 'p2' }),
        checkpoint({ path: GONE, hash: hashOf('old\n') }),
      );
      disk.snapshots.set(`/store${GONE}`, encode('old\n'));
      journal.baselines.push(leftAs(NEW, disk.put(NEW, 'a\nb\n')), leftAs(GONE, null));

      const changes = await list.execute(SESSION_ID, owner);

      expect(changes.promptId).toBe('p1');
      expect(changes.files).toEqual([
        expect.objectContaining({ path: APP, kind: 'modified', added: 2, removed: 2 }),
        expect.objectContaining({ path: GONE, kind: 'deleted', added: 0, removed: 1 }),
        expect.objectContaining({
          path: NEW,
          kind: 'created',
          added: 2,
          removed: 0,
          promptId: 'p2',
        }),
      ]);
    });

    it('marks a file somebody edited after the session — S-114', async () => {
      edited();
      disk.put(APP, 'by hand\n');

      const [file] = (await list.execute(SESSION_ID, owner)).files;

      expect(file).toMatchObject({ path: APP, modifiedOutside: true });
    });

    it('leaves out a file back to how it was before the session', async () => {
      edited(BEFORE);
      expect((await list.execute(SESSION_ID, owner)).files).toEqual([]);
    });

    it('cannot count the lines of a side that is not text, and still lists the change', async () => {
      edited();
      journal.checkpoints.push(checkpoint({ path: EDITED, restorable: 'tooLarge', hash: null }));
      disk.put(EDITED, 'x');
      disk.contents.set(APP, Uint8Array.from([0x00, 0x01]));

      const files = (await list.execute(SESSION_ID, owner)).files;

      expect(files.map(({ added, removed }) => [added, removed])).toEqual([
        [null, null],
        [null, null],
      ]);
    });
  });

  describe('one file of the changes — B-26', () => {
    let read: ReadSessionChangeUseCase;

    beforeEach(() => {
      read = new ReadSessionChangeUseCase(registry, stores);
    });

    it('brings the before, the now, the hunks and the revision — S-116', async () => {
      edited();

      const file = await read.execute(SESSION_ID, APP, owner);

      expect(file).toMatchObject({
        kind: 'modified',
        promptId: 'p1',
        modifiedOutside: false,
        before: { state: 'content', content: BEFORE },
        now: { state: 'content', content: AFTER },
        revision: hashOf(AFTER),
      });
      expect(file.hunks).toHaveLength(1);
    });

    it('refuses a path the session did not change — S-116', async () => {
      await expect(
        read.execute(SESSION_ID, '/srv/projects/app/other.js', owner),
      ).rejects.toBeInstanceOf(SessionChangeNotFoundError);
    });

    it('refuses a path that became a link, without reading it — S-117', async () => {
      edited();
      disk.files.set(APP, { kind: 'unsafe' });

      await expect(read.execute(SESSION_ID, APP, owner)).rejects.toBeInstanceOf(
        WorkspaceNotAllowedError,
      );
    });

    it('names a deleted file by the absent revision, and has no hunks for one too large', async () => {
      edited();
      journal.baselines.push(leftAs(APP, null));
      disk.files.set(APP, { kind: 'absent' });

      expect(await read.execute(SESSION_ID, APP, owner)).toMatchObject({
        kind: 'deleted',
        revision: 'absent',
        now: { state: 'absent' },
      });

      disk.put(APP, 'x'.repeat(20_000));
      expect(await read.execute(SESSION_ID, APP, owner)).toMatchObject({
        now: { state: 'notRestorable', reason: 'tooLarge' },
        hunks: [],
      });
    });

    it('is no change once the file is back, and still answers it', async () => {
      edited(BEFORE);
      expect(await read.execute(SESSION_ID, APP, owner)).toMatchObject({ kind: null, hunks: [] });
    });
  });

  describe('rejecting one hunk — B-31', () => {
    let reject: RejectChangeUseCase;
    let restore: RestoreChangeUseCase;

    beforeEach(() => {
      reject = new RejectChangeUseCase(registry, memory, stores, writing);
      restore = new RestoreChangeUseCase(registry, memory, stores, writing);
    });

    /** Two hunks far apart, so each is a choice of its own. */
    const LONG_BEFORE = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n';
    const LONG_AFTER = 'A\nb\nc\nd\ne\nf\ng\nh\ni\nJ\n';

    async function twoHunks(): Promise<{ first: string; second: string; revision: string }> {
      journal.checkpoints.push(checkpoint({ hash: hashOf(LONG_BEFORE) }));
      disk.snapshots.set(`/store${APP}`, encode(LONG_BEFORE));
      journal.baselines.push(leftAs(APP, disk.put(APP, LONG_AFTER)));

      const file = await new ReadSessionChangeUseCase(registry, stores).execute(
        SESSION_ID,
        APP,
        owner,
      );
      return {
        first: file.hunks[0]?.id ?? '',
        second: file.hunks[1]?.id ?? '',
        revision: file.revision,
      };
    }

    const text = (path: string): string => new TextDecoder().decode(disk.contents.get(path));

    it('puts back only that hunk, records it as the session’s, and says so — S-138', async () => {
      const { first, revision } = await twoHunks();

      const outcome = await reject.execute({
        sessionId: SESSION_ID,
        path: APP,
        hunkId: first,
        revision,
        userId: owner,
      });

      expect(text(APP)).toBe('a\nb\nc\nd\ne\nf\ng\nh\ni\nJ\n');
      expect(outcome).toEqual({
        promptId: 'p1',
        reverted: [{ path: APP, action: 'restored' }],
        preserved: [],
        unchanged: [],
        failed: [],
        hunkId: first,
      });
      expect(journal.recorded.at(-1)?.hash).toBe(hashOf(text(APP)));
    });

    it('enters the trail first, with the file and the hunk and no content — S-143', async () => {
      const { first, revision } = await twoHunks();

      await reject.execute({
        sessionId: SESSION_ID,
        path: APP,
        hunkId: first,
        revision,
        userId: owner,
      });

      expect(events.appended.at(-1)).toMatchObject({
        kind: 'session.filesRewound',
        subjectId: 'p1',
        details: { rejected: { path: APP, hunkId: first } },
      });
    });

    it('touches nothing when the trail cannot take it — S-143', async () => {
      const { first, revision } = await twoHunks();
      events.failure = new Error('the trail is down');

      await expect(
        reject.execute({
          sessionId: SESSION_ID,
          path: APP,
          hunkId: first,
          revision,
          userId: owner,
        }),
      ).rejects.toThrow('the trail is down');
      expect(disk.written).toEqual([]);
    });

    it('leaves the file as it was when the write fails, and remembers nothing', async () => {
      const { first, revision } = await twoHunks();
      disk.failing.add(APP);

      await expect(
        reject.execute({
          sessionId: SESSION_ID,
          path: APP,
          hunkId: first,
          revision,
          userId: owner,
        }),
      ).rejects.toThrow('the disk said no');
      expect(text(APP)).toBe(LONG_AFTER);
      expect(memory.rejectionOf(session, APP)).toBeNull();
    });

    it('refuses a revision that is no longer the disk, a file edited by hand and a hunk that is gone — S-139', async () => {
      const { first, revision } = await twoHunks();
      const asked = { sessionId: SESSION_ID, path: APP, hunkId: first, revision, userId: owner };

      await expect(reject.execute({ ...asked, revision: 'old' })).rejects.toBeInstanceOf(
        SessionChangeStaleError,
      );
      await expect(reject.execute({ ...asked, hunkId: 'h-gone' })).rejects.toBeInstanceOf(
        SessionChangeStaleError,
      );

      const byHand = disk.put(APP, 'by hand\n');
      await expect(reject.execute({ ...asked, revision: byHand })).rejects.toBeInstanceOf(
        SessionChangeStaleError,
      );
    });

    it('writes once when the same hunk is sent again — S-144', async () => {
      const { first, revision } = await twoHunks();
      const asked = { sessionId: SESSION_ID, path: APP, hunkId: first, revision, userId: owner };

      await reject.execute(asked);
      const again = await reject.execute(asked);

      expect(disk.written).toEqual([APP]);
      expect(again).toMatchObject({ reverted: [], unchanged: [{ path: APP }], hunkId: first });
    });

    it('removes a file the session created when its last hunk goes — S-141', async () => {
      journal.checkpoints.push(checkpoint({ path: NEW, existedBefore: 'absent', hash: null }));
      journal.baselines.push(leftAs(NEW, disk.put(NEW, 'done\n')));
      const file = await new ReadSessionChangeUseCase(registry, stores).execute(
        SESSION_ID,
        NEW,
        owner,
      );

      const outcome = await reject.execute({
        sessionId: SESSION_ID,
        path: NEW,
        hunkId: file.hunks[0]?.id ?? '',
        revision: file.revision,
        userId: owner,
      });

      expect(disk.removed).toEqual([NEW]);
      expect(outcome.reverted).toEqual([{ path: NEW, action: 'deleted' }]);
      expect(journal.recorded.at(-1)?.hash).toBeNull();
    });

    it('is refused while a turn runs, and gives the lock back after — conc', async () => {
      const { first, revision } = await twoHunks();
      session.observe('thinking');

      await expect(
        reject.execute({
          sessionId: SESSION_ID,
          path: APP,
          hunkId: first,
          revision,
          userId: owner,
        }),
      ).rejects.toBeInstanceOf(SessionLockedError);

      session.observe('idle');
      await reject.execute({
        sessionId: SESSION_ID,
        path: APP,
        hunkId: first,
        revision,
        userId: owner,
      });
      expect(session.isRewinding).toBe(false);
    });

    it('can be undone while the file is what it left, byte for byte — S-142', async () => {
      const { first, revision } = await twoHunks();
      await reject.execute({
        sessionId: SESSION_ID,
        path: APP,
        hunkId: first,
        revision,
        userId: owner,
      });

      const outcome = await restore.execute({ sessionId: SESSION_ID, path: APP, userId: owner });

      expect(text(APP)).toBe(LONG_AFTER);
      expect(outcome).toMatchObject({
        reverted: [{ path: APP, action: 'restored' }],
        hunkId: first,
      });
      expect(events.appended.at(-1)).toMatchObject({
        details: { restoredRejection: { path: APP, hunkId: first } },
      });
      await expect(
        restore.execute({ sessionId: SESSION_ID, path: APP, userId: owner }),
      ).rejects.toBeInstanceOf(SessionChangeNotFoundError);
    });

    it('cannot be undone once the file changed again — S-142', async () => {
      const { first, revision } = await twoHunks();
      await reject.execute({
        sessionId: SESSION_ID,
        path: APP,
        hunkId: first,
        revision,
        userId: owner,
      });
      disk.put(APP, 'changed again\n');

      await expect(
        restore.execute({ sessionId: SESSION_ID, path: APP, userId: owner }),
      ).rejects.toBeInstanceOf(SessionChangeStaleError);

      disk.files.set(APP, { kind: 'unsafe' });
      await expect(
        restore.execute({ sessionId: SESSION_ID, path: APP, userId: owner }),
      ).rejects.toBeInstanceOf(WorkspaceNotAllowedError);
    });

    it('brings back a created file whose last hunk went, and removes one that was not there', async () => {
      journal.checkpoints.push(checkpoint({ path: NEW, existedBefore: 'absent', hash: null }));
      journal.baselines.push(leftAs(NEW, disk.put(NEW, 'done\n')));
      const file = await new ReadSessionChangeUseCase(registry, stores).execute(
        SESSION_ID,
        NEW,
        owner,
      );
      await reject.execute({
        sessionId: SESSION_ID,
        path: NEW,
        hunkId: file.hunks[0]?.id ?? '',
        revision: file.revision,
        userId: owner,
      });

      expect(
        await restore.execute({ sessionId: SESSION_ID, path: NEW, userId: owner }),
      ).toMatchObject({
        reverted: [{ path: NEW, action: 'restored' }],
      });
      expect(text(NEW)).toBe('done\n');

      memory.rememberRejection(session, {
        path: GONE,
        promptId: 'p1',
        replaced: null,
        left: hashOf('x'),
      });
      disk.put(GONE, 'x');
      expect(
        await restore.execute({ sessionId: SESSION_ID, path: GONE, userId: owner }),
      ).toMatchObject({
        reverted: [{ path: GONE, action: 'deleted' }],
      });
    });
  });

  describe('rejecting whole files — B-30', () => {
    let rewind: RewindFilesUseCase;
    let restore: RestoreChangeUseCase;

    beforeEach(() => {
      const planner = new UndoPlanner(journal, disk, writing.clock, writing.lock);
      rewind = new RewindFilesUseCase(registry, planner, writing.trail, writing.clock, memory);
      restore = new RestoreChangeUseCase(registry, memory, stores, writing);

      edited();
      journal.checkpoints.push(checkpoint({ path: EDITED, hash: hashOf('e\n') }));
      disk.snapshots.set(`/store${EDITED}`, encode('e\n'));
      journal.baselines.push(leftAs(EDITED, disk.put(EDITED, 'E\n')));
    });

    it('puts back only the files asked for; the others stay — S-132', async () => {
      const outcome = await rewind.execute({
        sessionId: SESSION_ID,
        promptId: 'p1',
        paths: [APP],
        userId: owner,
      });

      expect(outcome.reverted).toEqual([{ path: APP, action: 'restored' }]);
      expect(disk.restored).toEqual([APP]);
      expect(events.appended.at(-1)?.details).toMatchObject({ paths: [APP] });
    });

    it('refuses a file the point does not reach — S-136', async () => {
      await expect(
        rewind.execute({ sessionId: SESSION_ID, promptId: 'p1', paths: [NEW], userId: owner }),
      ).rejects.toBeInstanceOf(RewindPathUnknownError);
      expect(disk.restored).toEqual([]);
    });

    it('keeps what it replaced, so the rejection can be undone', async () => {
      await rewind.execute({ sessionId: SESSION_ID, promptId: 'p1', paths: [APP], userId: owner });
      // The fake puts the snapshot's hash on the path, as the real restore would.
      disk.contents.set(APP, encode(BEFORE));

      await restore.execute({ sessionId: SESSION_ID, path: APP, userId: owner });

      expect(new TextDecoder().decode(disk.contents.get(APP))).toBe(AFTER);
    });
  });
});

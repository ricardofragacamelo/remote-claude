import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';

import { FileSnapshotStore } from '@adapter/outbound/checkpoint/file-snapshot.store';
import { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { DiskSessionFileJournal } from '@adapter/outbound/session/disk-session-file.journal';
import { SessionId } from '@domain/session';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const otherSession = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY0');
const now = new Date('2026-09-18T12:00:00.000Z');

/** Small enough that one test can exceed it without writing megabytes. */
const MAX_FILE_BYTES = 1_024;

/**
 * The two halves of undo, against a real filesystem and a real PostgreSQL.
 *
 * Both are real because both guarantees are theirs: the "only the first touch" rule is an
 * `ON CONFLICT DO NOTHING`, and what a snapshot actually contains is what the disk held.
 */
describe('the session file journal', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let workspace: string;
  let store: string;
  let journal: DiskSessionFileJournal;
  let files: DrizzleSessionFileRepository;
  let log: RecordingLogger;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    await migrate(connection.pool);
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'rc-journal-work-'));
    store = await mkdtemp(path.join(tmpdir(), 'rc-journal-store-'));
    log = new RecordingLogger();
    files = new DrizzleSessionFileRepository(
      aPersistenceContext(connection.db, { logger: log.logger }),
    );
    journal = new DiskSessionFileJournal(
      files,
      new FileSnapshotStore(store, { maxFileBytes: MAX_FILE_BYTES, maxStoreBytes: 1_000_000 }),
      new FixedClock(now),
      log.logger,
    );
  });

  afterEach(async () => {
    await connection.db.execute(sql`TRUNCATE TABLE "session_file_states"`);
    await connection.db.execute(sql`TRUNCATE TABLE "turn_file_checkpoints"`);
    await rm(workspace, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  });

  const file = (name = 'a.md'): string => path.join(workspace, name);

  const write = (content: string, name = 'a.md'): Promise<void> =>
    writeFile(file(name), content, 'utf8');

  describe('how the session left a file — B-46', () => {
    it('records path, hash and mtime after a write — S-99', async () => {
      await write('after');
      await journal.recordResult(sessionId, file());

      const [state] = await files.statesOf(sessionId);
      expect(state?.path).toBe(file());
      expect(state?.hash).toHaveLength(64);
      expect(state?.sizeBytes).toBe(5);
      expect(state?.mtime.getTime()).toBeCloseTo((await stat(file())).mtime.getTime(), -2);
    });

    it('leaves one row with the latest state after two writes — S-100', async () => {
      await write('first');
      await journal.recordResult(sessionId, file());

      await write('second');
      await journal.recordResult(sessionId, file());

      const states = await files.statesOf(sessionId);
      expect(states).toHaveLength(1);
      expect(states[0]?.sizeBytes).toBe(6);
    });

    it('records nothing when there is no file at the path — S-101', async () => {
      // A tool that failed did not change the file. Recording a hash here would create a baseline
      // the undo would later act on, for a write that never happened.
      await journal.recordResult(sessionId, file('never-written.md'));

      expect(await files.statesOf(sessionId)).toEqual([]);
    });

    it('keeps two sessions apart even on the same path', async () => {
      await write('shared');
      await journal.recordResult(sessionId, file());
      await journal.recordResult(otherSession, file());

      expect(await files.statesOf(sessionId)).toHaveLength(1);
      expect(await files.statesOf(otherSession)).toHaveLength(1);
    });

    it('never blocks, even when the database is unreachable — S-102', async () => {
      // The asymmetry with the trail, deliberately: without a trail there is no authorisation,
      // but without a baseline undo is only more conservative.
      const broken = new DiskSessionFileJournal(
        {
          saveState: () => Promise.reject(new Error('gone')),
        } as unknown as DrizzleSessionFileRepository,
        new FileSnapshotStore(store, { maxFileBytes: MAX_FILE_BYTES, maxStoreBytes: 1_000 }),
        new FixedClock(now),
        log.logger,
      );
      await write('after');

      await expect(broken.recordResult(sessionId, file())).resolves.toBeUndefined();
      expect(log.withOp('sessionFile.journal')[0]).toMatchObject({ level: 'warn' });
    });

    it('never touches the audit trail, which still refuses an UPDATE — S-103', async () => {
      await write('after');
      await journal.recordResult(sessionId, file());
      await journal.recordResult(sessionId, file());

      // Two writes, one row updated — the very operation the trail's trigger aborts. That is why
      // this is a table of its own.
      const rows = await connection.db.execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM "audit_entries"`,
      );
      expect(rows.rows[0]?.count).toBe('0');
    });
  });

  describe('what a file held before the turn — B-47', () => {
    it('keeps the contents, and only on the first touch — S-104', async () => {
      await write('original');
      await journal.openTurn(sessionId, 'prompt-1', 'refactor the parser');
      await journal.captureBefore(sessionId, 'prompt-1', file());

      await write('halfway');
      await journal.captureBefore(sessionId, 'prompt-1', file());

      const [checkpoint] = await files.checkpointsOf(sessionId, 'prompt-1');
      const blob = checkpoint?.snapshot().blobPath;
      expect(await readFile(String(blob), 'utf8')).toBe('original');
    });

    it('labels the checkpoint with the prompt, which is what the UI shows', async () => {
      await write('original');
      await journal.openTurn(sessionId, 'prompt-1', 'refactor the parser');
      await journal.captureBefore(sessionId, 'prompt-1', file());

      expect((await files.checkpointsOf(sessionId, 'prompt-1'))[0]?.snapshot().promptText).toBe(
        'refactor the parser',
      );
    });

    it('records a file the turn created as absent before — S-105', async () => {
      // Not a gap: it is what lets undo **delete** the file, instead of leaving it behind because
      // there was nothing to restore.
      await journal.openTurn(sessionId, 'prompt-1', 'create it');
      await journal.captureBefore(sessionId, 'prompt-1', file('new.md'));

      const [checkpoint] = await files.checkpointsOf(sessionId, 'prompt-1');
      expect(checkpoint?.existedBefore).toBe('absent');
      expect(checkpoint?.canBeRestored).toBe(true);
      expect(checkpoint?.snapshot().blobPath).toBeNull();
    });

    it('gives two turns their own checkpoint of the same path — S-106', async () => {
      await write('one');
      await journal.openTurn(sessionId, 'prompt-1', 'first');
      await journal.captureBefore(sessionId, 'prompt-1', file());

      await write('two');
      await journal.openTurn(sessionId, 'prompt-2', 'second');
      await journal.captureBefore(sessionId, 'prompt-2', file());

      const first = await files.checkpointsOf(sessionId, 'prompt-1');
      const second = await files.checkpointsOf(sessionId, 'prompt-2');
      expect(await readFile(String(first[0]?.snapshot().blobPath), 'utf8')).toBe('one');
      expect(await readFile(String(second[0]?.snapshot().blobPath), 'utf8')).toBe('two');
    });

    it('records a file above the limit as not restorable — S-108', async () => {
      // The undo has to know it cannot promise this path, rather than discovering that at the
      // moment somebody asks for their work back.
      await write('x'.repeat(MAX_FILE_BYTES + 1));
      await journal.openTurn(sessionId, 'prompt-1', 'touch the big one');
      await journal.captureBefore(sessionId, 'prompt-1', file());

      const [checkpoint] = await files.checkpointsOf(sessionId, 'prompt-1');
      expect(checkpoint?.restorable).toBe('tooLarge');
      expect(checkpoint?.canBeRestored).toBe(false);
      expect(checkpoint?.snapshot().blobPath).toBeNull();
    });

    it('never blocks when the snapshot cannot be written', async () => {
      const broken = new DiskSessionFileJournal(
        {
          saveCheckpointIfAbsent: () => Promise.reject(new Error('gone')),
        } as unknown as DrizzleSessionFileRepository,
        new FileSnapshotStore(store, { maxFileBytes: MAX_FILE_BYTES, maxStoreBytes: 1_000_000 }),
        new FixedClock(now),
        log.logger,
      );
      await write('original');

      await expect(broken.captureBefore(sessionId, 'prompt-1', file())).resolves.toBeUndefined();
    });
  });

  describe('the purge — S-107', () => {
    it('never removes a session that is still running', async () => {
      const tiny = new FileSnapshotStore(store, { maxFileBytes: MAX_FILE_BYTES, maxStoreBytes: 1 });
      await write('original');
      await tiny.capture(sessionId.value, 'prompt-1', file());

      // A running session can still be asked to undo. Purging underneath it would take away the
      // only copy of somebody's file while they were still working on it.
      expect(await tiny.purge(new Set([sessionId.value]))).toEqual([]);
      expect(await tiny.size()).toBeGreaterThan(0);
    });

    it('removes what it may until the store is under its ceiling', async () => {
      const tiny = new FileSnapshotStore(store, { maxFileBytes: MAX_FILE_BYTES, maxStoreBytes: 1 });
      await write('original');
      await tiny.capture(otherSession.value, 'prompt-1', file());

      expect(await tiny.purge(new Set())).toEqual([otherSession.value]);
      expect(await tiny.size()).toBe(0);
    });

    it('leaves the store alone while it is under the ceiling', async () => {
      await write('original');
      const roomy = new FileSnapshotStore(store, {
        maxFileBytes: MAX_FILE_BYTES,
        maxStoreBytes: 1_000_000,
      });
      await roomy.capture(otherSession.value, 'prompt-1', file());

      expect(await roomy.purge(new Set())).toEqual([]);
    });

    it('forgets the rows of the sessions it removed, so none points at nothing', async () => {
      await write('original');
      await journal.captureBefore(otherSession, 'prompt-1', file());

      await files.forgetCheckpoints([otherSession.value]);

      expect(await files.checkpointsOf(otherSession, 'prompt-1')).toEqual([]);
    });

    it('does nothing when asked to forget no sessions at all', async () => {
      await expect(files.forgetCheckpoints([])).resolves.toBeUndefined();
    });

    it('answers nothing for a store that does not exist yet', async () => {
      const missing = new FileSnapshotStore(path.join(store, 'nope'), {
        maxFileBytes: MAX_FILE_BYTES,
        maxStoreBytes: 1,
      });

      expect(await missing.size()).toBe(0);
      expect(await missing.purge(new Set())).toEqual([]);
    });
  });
});

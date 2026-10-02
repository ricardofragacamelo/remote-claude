import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RecordAuditEventUseCase } from '@application/audit';
import { FileTrail, SaveFileUseCase, UserWrites } from '@application/files';
import type { FolderDisk } from '@application/files';
import { UndoPlanner } from '@application/session';
import type { LiveSession, UndoDisk } from '@application/session';
import { UserId } from '@domain/auth';
import { Etag } from '@domain/files';
import { SessionId, TurnFileCheckpoint } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import { WorkspacePath } from '@domain/workspace';
import { NodeUndoDisk } from '@adapter/outbound/checkpoint/node-undo.disk';
import { IconvTextCodec } from '@adapter/outbound/files/iconv.text-codec';
import { NodeFolderDisk } from '@adapter/outbound/filesystem/node-folder-disk';
import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { aHistoryKeeper } from '../../../../support/fakes/in-memory-file-history';
import { InMemoryUndoJournal } from '../../../../support/fakes/in-memory-undo';
import { RecordingAuditEvents } from '../../../../support/fakes/recording-audit-events';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';

const SESSION = SessionId.create('01J0SESS0000000000000000S1');
const CONVERSATION = ClaudeSessionId.create('5c6f0d2e-6a3b-4f7e-9d1c-2b8a7e4f3c10');
const owner = UserId.create('auth|42');
const now = new Date('2026-09-30T12:00:00.000Z');

const hex = (content: string): string => createHash('sha256').update(content).digest('hex');

/** A pause long enough for the other writer to try to get in, if nothing stops it. */
const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

/**
 * The person's save and the undo of a session, on one file, at the same moment — plan 07, B-18.
 *
 * Both are real — the atomic writer of `files` and the restore of the undo, on a real disk — and
 * share the one lock the platform provides. Each side is slowed down inside its write, so a lock
 * that did not hold would show as the two interleaving.
 */
describe('a save and an undo of the same file', () => {
  let base: string;
  let file: string;
  let trace: string[];
  let lock: InMemoryPathLock;

  beforeEach(async () => {
    base = await realpath(await mkdtemp(path.join(tmpdir(), 'rc-save-undo-')));
    await mkdir(path.join(base, 'store'));
    file = path.join(base, 'a.md');
    await writeFile(file, 'claude\n');
    await writeFile(path.join(base, 'store', 'blob'), 'before\n');
    trace = [];
    lock = new InMemoryPathLock();
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  /** A writer that says when it starts and ends, and takes its time in between. */
  function traced<T>(name: string, write: () => Promise<T>): Promise<T> {
    trace.push(`${name}:start`);
    return pause()
      .then(write)
      .finally(() => trace.push(`${name}:end`));
  }

  function saver(): SaveFileUseCase {
    const real = new NodeFolderDisk(new RecordingLogger().logger);
    const disk: FolderDisk = Object.assign(Object.create(real) as FolderDisk, {
      write: (...args: Parameters<FolderDisk['write']>) =>
        traced('save', () => real.write(...args)),
    });
    const trail = new FileTrail(
      new RecordAuditEventUseCase(new RecordingAuditEvents(), new SequentialIds('01J0AUD')),
      new FixedClock(now),
      () => undefined,
    );

    return new SaveFileUseCase(
      {
        folders: { resolve: () => Promise.resolve(WorkspacePath.create(base)) },
        disk: disk,
        codec: new IconvTextCodec(),
        lock: lock,
        trail: trail,
        limits: { maxEditBytes: 1_000_000 },
        writes: new UserWrites(new FixedClock(new Date(0))),
      },
      aHistoryKeeper(disk),
    );
  }

  function planner(): UndoPlanner {
    const real = new NodeUndoDisk(new RecordingLogger().logger);
    const disk: UndoDisk = {
      observe: (target) => real.observe(target),
      remove: (target) => real.remove(target),
      restore: (checkpoint) => traced('undo', () => real.restore(checkpoint)),
    };

    return new UndoPlanner(new InMemoryUndoJournal(), disk, new FixedClock(now), lock);
  }

  const verdict = {
    path: '',
    outcome: 'revert' as const,
    action: 'restore' as const,
    checkpoint: null as unknown as TurnFileCheckpoint,
  };

  const live = {
    session: { id: SESSION },
    conversation: { claudeSessionId: CONVERSATION },
  } as unknown as LiveSession;

  const checkpointOf = (): TurnFileCheckpoint =>
    TurnFileCheckpoint.capture({
      sessionId: SESSION,
      claudeSessionId: CONVERSATION,
      promptId: 'p1',
      path: file,
      existedBefore: 'present',
      blobPath: path.join(base, 'store', 'blob'),
      hash: hex('before\n'),
      sizeBytes: 7,
      restorable: 'yes',
      promptText: 'turn',
      capturedAt: now,
    });

  const save = (): ReturnType<SaveFileUseCase['execute']> =>
    saver().execute(
      {
        folder: base,
        path: 'a.md',
        content: 'person\n',
        encoding: 'utf8',
        bom: false,
        ifMatch: `"${hex('claude\n')}"`,
        confirmSensitive: false,
      },
      owner,
    );

  const undo = (): Promise<boolean> =>
    planner().apply(live, { ...verdict, path: file, checkpoint: checkpointOf() });

  it('lets an undo that got the lock first finish, and the save then finds its version — S-125', async () => {
    const [saved, undone] = await Promise.allSettled([save(), undo()]);

    expect(trace).toEqual(['undo:start', 'undo:end']);
    expect(undone).toEqual({ status: 'fulfilled', value: true });
    expect(saved).toMatchObject({
      status: 'rejected',
      reason: { code: 'FILE_CHANGED', params: { currentEtag: `"${hex('before\n')}"` } },
    });
    expect(await readFile(file, 'utf8')).toBe('before\n');
    expect(lock.held).toBe(0);
  });

  it('makes an undo wait for a save that holds the lock, and ends with one whole version — S-125', async () => {
    const saving = save();

    while (!trace.includes('save:start')) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const [saved, undone] = await Promise.allSettled([saving, undo()]);

    expect(trace).toEqual(['save:start', 'save:end', 'undo:start', 'undo:end']);
    expect(saved).toMatchObject({ status: 'fulfilled', value: { written: true } });
    expect(undone).toEqual({ status: 'fulfilled', value: true });

    // The snapshot, whole — and its ETag is what a read answers, so the editor learns which.
    const onDisk = await readFile(file);
    expect(onDisk.toString()).toBe('before\n');
    expect(Etag.of(onDisk).value).toBe(`"${hex('before\n')}"`);
    expect(lock.held).toBe(0);
  });
});

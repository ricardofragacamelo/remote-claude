import { describe, expect, it } from 'vitest';

import { SaveFileUseCase } from '@application/files';
import type { FolderDisk, SaveFileCommand } from '@application/files';
import { UserId } from '@domain/auth';
import { Etag } from '@domain/files';
import { historyWriting, HISTORY_FOLDER } from '../../../support/files/history-writing';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';

const owner = UserId.create('auth|42');
const one = Buffer.from('one\n');

const command = (overrides: Partial<SaveFileCommand> = {}): SaveFileCommand => ({
  folder: HISTORY_FOLDER.value,
  path: 'a.ts',
  content: 'two\n',
  encoding: 'utf8',
  bom: false,
  ifMatch: Etag.of(one).value,
  confirmSensitive: false,
  ...overrides,
});

/** A disk holding `one\n` in `a.ts`, which says in `trace` what was asked of it, in order. */
function aDisk(trace: string[], overrides: Partial<FolderDisk> = {}): FolderDisk {
  return stubFolderDisk({
    inspect: () => Promise.resolve({ kind: 'file', size: one.length, identity: '1:1' }),
    version: () => Promise.resolve(Etag.of(one)),
    read: () => {
      trace.push('read');
      return Promise.resolve({ bytes: one, mtime: new Date(0) });
    },
    write: (_file, bytes, guard) => {
      trace.push('write');
      guard(Etag.of(one));
      return Promise.resolve({ size: bytes.length, mtime: new Date(0) });
    },
    ...overrides,
  });
}

describe('SaveFileUseCase keeps the version it replaces — B-57', () => {
  it('keeps the previous version before the write, and answers its entry — S-329', async () => {
    const trace: string[] = [];
    const parts = historyWriting(aDisk(trace));
    const saved = await new SaveFileUseCase(parts.writing, parts.keeper).execute(command(), owner);

    expect(trace).toEqual(['read', 'write']);
    expect(saved.history).toEqual({ kept: true, entryId: parts.store.entries[0]?.id });
    expect(parts.store.entries[0]).toMatchObject({
      reason: 'save',
      hash: Etag.of(one).digest,
      sizeBytes: one.length,
      path: '/srv/app/a.ts',
    });
  });

  it('saves when the history fails, and says that version was not kept — S-336', async () => {
    const trace: string[] = [];
    const parts = historyWriting(aDisk(trace));
    parts.store.failure = new Error('database down');

    const saved = await new SaveFileUseCase(parts.writing, parts.keeper).execute(command(), owner);

    expect(saved).toMatchObject({ written: true, history: { kept: false, reason: 'unavailable' } });
    expect(trace).toEqual(['write']);
    expect(parts.failures.map((failure) => failure.path)).toEqual(['a.ts']);
    expect(parts.events.kinds).toEqual(['file.written']);
  });

  it('says tooLarge past the snapshot ceiling, and still saves — S-333', async () => {
    const parts = historyWriting(aDisk([]), { maxFileBytes: 2 });
    const saved = await new SaveFileUseCase(parts.writing, parts.keeper).execute(command(), owner);

    expect(saved.history).toEqual({ kept: false, reason: 'tooLarge' });
    expect(parts.store.entries.map((entry) => entry.kept)).toEqual(['tooLarge']);
  });

  it('keeps nothing when nothing is written — the retry of a lost answer', async () => {
    const parts = historyWriting(
      aDisk([], { version: () => Promise.resolve(Etag.of(Buffer.from('two\n'))) }),
    );
    const saved = await new SaveFileUseCase(parts.writing, parts.keeper).execute(command(), owner);

    expect(saved).toMatchObject({ written: false, history: null });
    expect(parts.store.entries).toEqual([]);
  });

  it('keeps nothing of a save refused by its precondition', async () => {
    const parts = historyWriting(aDisk([]));

    await expect(
      new SaveFileUseCase(parts.writing, parts.keeper).execute(
        command({ ifMatch: Etag.of(Buffer.from('old')).value }),
        owner,
      ),
    ).rejects.toMatchObject({ code: 'FILE_CHANGED' });
    expect(parts.store.entries).toEqual([]);
  });
});

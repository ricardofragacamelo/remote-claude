import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  DirectoryNotEmptyError,
  HISTORY_REASONS,
  HistoryEntryNotFoundError,
  PreconditionRequiredError,
  authorOf,
  hasContents,
  keptFor,
  storeCutoff,
} from '@domain/files';
import type { HistoryEntry } from '@domain/files';
import { httpStatusFor, toErrorEnvelope } from '@shared/errors/error-catalogue';

const writer = UserId.create('auth|writer');
const reader = UserId.create('auth|reader');

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: '01J1000000000000000000001',
    seq: 1,
    userId: writer,
    path: '/srv/app/a.ts',
    label: 'a.ts',
    entryKind: 'file',
    hash: 'a'.repeat(64),
    sizeBytes: 4,
    reason: 'save',
    kept: 'yes',
    batchId: null,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    ...overrides,
  };
}

/** The web's catalogue, which is where every `messageKey` of the backend is translated. */
function locale(name: 'en' | 'pt-BR'): Record<string, Record<string, Record<string, string>>> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.join(here, '../../../../../web/src/shared/i18n/locales', `${name}.json`);

  return JSON.parse(readFileSync(file, 'utf8')) as Record<
    string,
    Record<string, Record<string, string>>
  >;
}

describe('the rules of the local history — plan 07, F8', () => {
  it('keeps a file up to the snapshot ceiling, and says tooLarge past it — S-333', () => {
    expect(keptFor(10, 10)).toBe('yes');
    expect(keptFor(11, 10)).toBe('tooLarge');
  });

  it('has contents only for a kept file', () => {
    expect(hasContents(entry())).toBe(true);
    expect(hasContents(entry({ kept: 'tooLarge' }))).toBe(false);
    expect(hasContents(entry({ entryKind: 'directory', hash: null, sizeBytes: null }))).toBe(false);
  });

  it('says who wrote a version, and whether it was the caller — S-350', () => {
    expect(authorOf(entry(), writer)).toEqual({ self: true, id: 'auth|writer' });
    expect(authorOf(entry(), reader)).toEqual({ self: false, id: 'auth|writer' });
  });

  it('names the four reasons a version is kept, and no move', () => {
    expect(HISTORY_REASONS).toEqual(['save', 'delete', 'restore', 'upload']);
  });

  describe('storeCutoff — S-331', () => {
    it('purges nothing while the distinct blobs fit', () => {
      expect(storeCutoff([], 10)).toBeNull();
      expect(storeCutoff([{ sizeBytes: 10, newestSeq: 3 }], 10)).toBeNull();
    });

    it('goes by the newest entry of each blob, the oldest first, until what is left fits', () => {
      const blobs = [
        { sizeBytes: 6, newestSeq: 9 },
        { sizeBytes: 5, newestSeq: 2 },
        { sizeBytes: 4, newestSeq: 5 },
      ];

      // 15 bytes, 10 allowed: dropping the blob whose newest entry is 2 leaves 10.
      expect(storeCutoff(blobs, 10)).toBe(2);
      // 6 allowed: the blob of 5 and the one of 4 go — everything up to entry 5.
      expect(storeCutoff(blobs, 6)).toBe(5);
      expect(storeCutoff(blobs, 0)).toBe(9);
    });

    it('takes everything when no amount of removing fits a ceiling below zero', () => {
      expect(storeCutoff([{ sizeBytes: 1, newestSeq: 4 }], -1)).toBe(4);
      expect(storeCutoff([], -1)).toBeNull();
    });
  });
});

describe('the refusals of the local history — S-328', () => {
  it('HISTORY_ENTRY_NOT_FOUND is a 404 with the entry and a key in both languages', () => {
    const error = new HistoryEntryNotFoundError('01J1');
    const envelope = toErrorEnvelope(error, 'trace');

    expect(httpStatusFor('HISTORY_ENTRY_NOT_FOUND')).toBe(404);
    expect(envelope.error).toMatchObject({
      code: 'HISTORY_ENTRY_NOT_FOUND',
      messageKey: 'files.error.historyEntryNotFound',
      params: { entryId: '01J1' },
      httpEquivalent: 404,
    });

    for (const name of ['en', 'pt-BR'] as const) {
      expect(locale(name)['files']?.['error']?.['historyEntryNotFound']).toEqual(
        expect.any(String),
      );
    }
  });

  it('a file the history did not take is 428 notKept, with why', () => {
    expect(new PreconditionRequiredError('a.ts', 'notKept', 'tooLarge').params).toEqual({
      path: 'a.ts',
      reason: 'notKept',
      why: 'tooLarge',
    });
    expect(new PreconditionRequiredError('a.ts', 'ifMatchMissing').params).toEqual({
      path: 'a.ts',
      reason: 'ifMatchMissing',
    });
  });

  it('a folder the history did not take is 409 with the count and notKept', () => {
    expect(new DirectoryNotEmptyError('src', 3, false, 'tooMany').params).toEqual({
      path: 'src',
      entryCount: 3,
      entryCountCapped: false,
      notKept: 'tooMany',
    });
    expect(new DirectoryNotEmptyError('src', 3, true).params).toEqual({
      path: 'src',
      entryCount: 3,
      entryCountCapped: true,
    });
  });

  it('the restore is a fact of the trail, translated in both languages', () => {
    for (const name of ['en', 'pt-BR'] as const) {
      expect(locale(name)['audit']?.['fileAct']?.['restored']).toEqual(expect.any(String));
    }
  });
});

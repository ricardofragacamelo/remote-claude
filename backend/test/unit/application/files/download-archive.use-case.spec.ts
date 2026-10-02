import { describe, expect, it } from 'vitest';

import { DownloadArchiveUseCase } from '@application/files';
import type { ArchiveEntry, ArchiveSource, CopyCeiling, FolderDisk } from '@application/files';
import { UserId } from '@domain/auth';
import { FilePath, FileTooLargeError, FileTrailUnavailableError } from '@domain/files';
import type { FilePath as Path } from '@domain/files';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';
import { WRITING_FOLDER, aFileTrail } from '../../../support/files/file-writing';

const owner = UserId.create('auth|42');
const at = (relative: string): Path => FilePath.create(WRITING_FOLDER, relative);

const source = (
  selection: number,
  relative: string,
  kind: 'file' | 'directory',
  size = 0,
): ArchiveSource => ({
  selection,
  path: at(relative),
  kind,
  size,
  mtime: new Date(0),
  mode: 0o644,
});

/** What the disk was asked, by a spec that looks. */
interface Asked {
  selection: readonly string[];
  ceiling: CopyCeiling | null;
  archived: readonly ArchiveEntry[];
}

function archiver(
  found: readonly ArchiveSource[],
  events = new RecordingAuditEvents(),
  asked: Asked = { selection: [], ceiling: null, archived: [] },
  survey: FolderDisk['survey'] | null = null,
): DownloadArchiveUseCase {
  const disk = stubFolderDisk({
    survey:
      survey ??
      ((selection, ceiling) => {
        asked.selection = selection.map((entry) => entry.relative);
        asked.ceiling = ceiling;
        return Promise.resolve(found);
      }),
    archive: (entries) => {
      asked.archived = entries;
      return Promise.resolve({ chunks: [], close: () => Promise.resolve() } as never);
    },
  });

  return new DownloadArchiveUseCase(
    { resolve: () => Promise.resolve(WRITING_FOLDER) },
    disk,
    aFileTrail(events),
    { archiveMaxEntries: 200, downloadMaxBytes: 1000 },
  );
}

/** A zip of a selection — plan 07, B-48, with fakes for the disk and the trail. */
describe('DownloadArchiveUseCase', () => {
  it('zips a folder under its own name, measured against both ceilings — S-297', async () => {
    const asked: Asked = { selection: [], ceiling: null, archived: [] };
    const found = [source(0, 'src', 'directory'), source(0, 'src/a.ts', 'file', 5)];

    const archive = await archiver(found, undefined, asked).execute(
      { folder: WRITING_FOLDER.value, paths: ['src'] },
      owner,
    );

    expect(asked.ceiling).toEqual({ entries: 200, bytes: 1000 });
    expect(asked.archived.map((entry) => entry.name)).toEqual(['src', 'src/a.ts']);
    expect(archive).toMatchObject({ fileName: 'src.zip', entries: 2, bytes: 5 });
  });

  it('records one download per selected item, before the zip is opened — S-359', async () => {
    const events = new RecordingAuditEvents();
    const asked: Asked = { selection: [], ceiling: null, archived: [] };
    const found = [
      source(0, 'a.txt', 'file', 3),
      source(1, 'b.txt', 'file', 4),
      source(2, 'docs', 'directory'),
      source(2, 'docs/c.md', 'file', 2),
    ];

    await archiver(found, events, asked).execute(
      { folder: WRITING_FOLDER.value, paths: ['a.txt', 'b.txt', 'docs', 'docs/c.md'] },
      owner,
    );

    expect(asked.selection).toEqual(['a.txt', 'b.txt', 'docs']);
    expect(events.kinds).toEqual(['file.downloaded', 'file.downloaded', 'file.downloaded']);
    expect(events.appended.map((event) => [event.subjectLabel, event.details])).toEqual([
      ['a.txt', { archive: true, entryKind: 'file', entries: 1, sizeBytes: 3 }],
      ['b.txt', { archive: true, entryKind: 'file', entries: 1, sizeBytes: 4 }],
      ['docs', { archive: true, entryKind: 'directory', entries: 2, sizeBytes: 2 }],
    ]);
    expect(asked.archived.map((entry) => entry.name)).toEqual([
      'a.txt',
      'b.txt',
      'docs',
      'docs/c.md',
    ]);
  });

  it('says what an item was when the walk found nothing of it', async () => {
    const events = new RecordingAuditEvents();

    await archiver([], events).execute({ folder: WRITING_FOLDER.value, paths: ['gone'] }, owner);

    expect(events.appended[0]?.details).toMatchObject({ entryKind: null, entries: 0 });
  });

  it('lets a refusal of the walk through, and records nothing — S-298', async () => {
    const events = new RecordingAuditEvents();
    const refusing = archiver([], events, undefined, () =>
      Promise.reject(new FileTooLargeError('src', 201, 200, 'entries')),
    );

    await expect(
      refusing.execute({ folder: WRITING_FOLDER.value, paths: ['src'] }, owner),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', params: { measure: 'entries' } });
    expect(events.appended).toEqual([]);
  });

  it('opens no zip when the trail is down — S-300', async () => {
    const events = new RecordingAuditEvents();
    const asked: Asked = { selection: [], ceiling: null, archived: [] };
    events.failure = new Error('the database is gone');

    await expect(
      archiver([source(0, 'a.txt', 'file', 1)], events, asked).execute(
        { folder: WRITING_FOLDER.value, paths: ['a.txt'] },
        owner,
      ),
    ).rejects.toBeInstanceOf(FileTrailUnavailableError);
    expect(asked.archived).toEqual([]);
  });
});

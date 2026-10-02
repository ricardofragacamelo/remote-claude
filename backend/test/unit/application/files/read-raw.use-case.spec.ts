import { describe, expect, it } from 'vitest';

import { ReadRawUseCase, VersionCache } from '@application/files';
import type { FolderDisk, ReadRawQuery } from '@application/files';
import { UserId } from '@domain/auth';
import {
  Etag,
  FileChangedError,
  FileTooLargeError,
  FileTrailUnavailableError,
  RangeNotSatisfiableError,
} from '@domain/files';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { fakeRawFile } from '../../../support/fakes/fake-raw-file';
import type { FakeRawFile } from '../../../support/fakes/fake-raw-file';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';
import { WRITING_FOLDER, WRITING_NOW, aFileTrail } from '../../../support/files/file-writing';

const owner = UserId.create('auth|42');
const CONTENT = Buffer.from('0123456789');

const query = (overrides: Partial<ReadRawQuery> = {}): ReadRawQuery => ({
  folder: WRITING_FOLDER.value,
  path: 'digits.txt',
  range: null,
  ifMatch: null,
  download: false,
  ...overrides,
});

function reader(
  file: FakeRawFile,
  events = new RecordingAuditEvents(),
  downloadMaxBytes = 1024,
): ReadRawUseCase {
  const disk: FolderDisk = stubFolderDisk({ openRaw: () => Promise.resolve(file) });

  return new ReadRawUseCase(
    { resolve: () => Promise.resolve(WRITING_FOLDER) },
    disk,
    aFileTrail(events),
    new VersionCache(new FixedClock(WRITING_NOW)),
    { downloadMaxBytes },
  );
}

/** The raw bytes of a file — plan 07, B-48, with fakes for the disk and the trail. */
describe('ReadRawUseCase', () => {
  it('serves the whole file with its version and its type, outside the trail — S-293', async () => {
    const events = new RecordingAuditEvents();
    const file = fakeRawFile(CONTENT);

    const content = await reader(file, events).execute(query(), owner);

    expect(content).toMatchObject({
      etag: Etag.of(CONTENT),
      size: 10,
      length: 10,
      range: null,
      contentType: 'text/plain; charset=utf-8',
      inline: true,
    });
    expect(file.asked).toEqual([[0, 9]]);
    expect(events.appended).toEqual([]);
    expect(file.closed).toBe(false);
  });

  it('serves one range as a part — S-294', async () => {
    const file = fakeRawFile(CONTENT);

    const content = await reader(file).execute(query({ range: 'bytes=2-5' }), owner);

    expect(content).toMatchObject({ range: { start: 2, end: 5 }, length: 4, size: 10 });
    expect(file.asked).toEqual([[2, 5]]);
  });

  it('refuses a range past the end with the size, and closes the file — S-295', async () => {
    const file = fakeRawFile(CONTENT);

    await expect(reader(file).execute(query({ range: 'bytes=10-' }), owner)).rejects.toMatchObject({
      code: 'RANGE_NOT_SATISFIABLE',
      params: { size: 10 },
    });
    await expect(
      reader(fakeRawFile(CONTENT)).execute(query({ range: 'bytes=10-' }), owner),
    ).rejects.toBeInstanceOf(RangeNotSatisfiableError);
    expect(file.closed).toBe(true);
  });

  it('refuses a page of another version with the current one — B-51', async () => {
    const file = fakeRawFile(CONTENT);

    await expect(
      reader(file).execute(query({ ifMatch: '"another"', range: 'bytes=0-1' }), owner),
    ).rejects.toMatchObject({
      code: 'FILE_CHANGED',
      params: { currentEtag: Etag.of(CONTENT).value },
    });
    expect(file.closed).toBe(true);
  });

  it('serves a page of the version it names, and `*` names any', async () => {
    const reading = reader(fakeRawFile(CONTENT));

    await expect(
      reading.execute(query({ ifMatch: Etag.of(CONTENT).value }), owner),
    ).resolves.toMatchObject({ length: 10 });
    await expect(reading.execute(query({ ifMatch: '*' }), owner)).resolves.toMatchObject({
      length: 10,
    });
    await expect(reading.execute(query({ ifMatch: 'W/"x"' }), owner)).rejects.toBeInstanceOf(
      FileChangedError,
    );
  });

  it('refuses a whole file past the download ceiling, and lets a page of it through — fron', async () => {
    await expect(
      reader(fakeRawFile(CONTENT), undefined, 9).execute(query(), owner),
    ).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      params: { size: 10, limit: 9, measure: 'bytes' },
    });
    await expect(
      reader(fakeRawFile(CONTENT), undefined, 10).execute(query(), owner),
    ).resolves.toMatchObject({ length: 10 });
    await expect(
      reader(fakeRawFile(CONTENT), undefined, 9).execute(query({ range: 'bytes=0-8' }), owner),
    ).resolves.toMatchObject({ length: 9 });
    await expect(
      reader(fakeRawFile(CONTENT), undefined, 9).execute(query({ range: 'bytes=0-9' }), owner),
    ).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it('serves an empty file as no bytes at all', async () => {
    const file = fakeRawFile(new Uint8Array(0));

    await expect(reader(file).execute(query(), owner)).resolves.toMatchObject({
      length: 0,
      range: null,
    });
    expect(file.asked).toEqual([[0, -1]]);
  });

  it('records a download before the first byte, never inline — S-300', async () => {
    const events = new RecordingAuditEvents();
    const file = fakeRawFile(CONTENT);

    const content = await reader(file, events).execute(query({ download: true }), owner);

    expect(content.inline).toBe(false);
    expect(events.kinds).toEqual(['file.downloaded']);
    expect(events.appended[0]).toMatchObject({
      subjectId: '/srv/app/file',
      subjectLabel: 'digits.txt',
      details: { sizeBytes: 10, hash: Etag.of(CONTENT).value, range: null, archive: false },
    });
  });

  it('sends nothing when the trail cannot take the download — S-300', async () => {
    const events = new RecordingAuditEvents();
    const file = fakeRawFile(CONTENT);
    events.failure = new Error('the database is gone');

    await expect(
      reader(file, events).execute(query({ download: true }), owner),
    ).rejects.toBeInstanceOf(FileTrailUnavailableError);
    expect(file.asked).toEqual([]);
    expect(file.closed).toBe(true);
  });

  it('sends a binary as an attachment, even to be shown — S-296', async () => {
    const content = await reader(fakeRawFile(Buffer.from([0x00, 0x01, 0x02]))).execute(
      query(),
      owner,
    );

    expect(content).toMatchObject({ contentType: 'application/octet-stream', inline: false });
  });

  it('says a probe that covers only the start of the file is not the whole of it', async () => {
    // 'é' cut at the end of the probe: forgiven only because the file goes on.
    const long = Buffer.concat([Buffer.alloc(8191, 0x61), Buffer.from('é'), Buffer.from('z')]);

    const content = await reader(fakeRawFile(long), undefined, 10_000).execute(query(), owner);

    expect(content.contentType).toBe('text/plain; charset=utf-8');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { HistoryBlobDirectory } from '@adapter/outbound/filesystem/history-blob.directory';
import { Etag } from '@domain/files';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const marker = Buffer.from('MARKER-contents-of-a-version\n');
const hash = Etag.of(marker).digest;

/**
 * The blobs of the local history on a real disk — plan 07, B-56: addressed by content, written by a
 * temporary and a rename, swept by what the rows still name, and never the contents in the log.
 */
describe('HistoryBlobDirectory', () => {
  let root: string;
  let log: RecordingLogger;
  let blobs: HistoryBlobDirectory;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'rc-blobs-'));
    log = new RecordingLogger();
    blobs = new HistoryBlobDirectory(root, log.logger);
  });

  afterEach(async () => {
    await chmod(path.join(root, hash.slice(0, 2)), 0o755).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });

  it('writes a blob under its hash, once, and reads it back — S-330', async () => {
    await blobs.put(hash, marker);
    await blobs.put(hash, marker);

    expect(await readdir(path.join(root, hash.slice(0, 2)))).toEqual([hash]);
    expect(Buffer.from((await blobs.read(hash)) ?? [])).toEqual(marker);
    expect(log.withOp('files.history.blob.put').map((line) => line['reused'])).toEqual([
      undefined,
      false,
      undefined,
      true,
    ]);
    expect(JSON.stringify(log.lines)).not.toContain('MARKER');
  });

  it('reads nothing for a blob that is not there, or not what it is named by', async () => {
    expect(await blobs.read(hash)).toBeNull();

    await mkdir(path.join(root, hash.slice(0, 2)));
    await writeFile(path.join(root, hash.slice(0, 2), hash), 'damaged');

    expect(await blobs.read(hash)).toBeNull();
    expect(log.lines.some((line) => line.level === 'warn')).toBe(true);
  });

  it('refuses a name that is not a SHA-256, so a row can never point at a path', async () => {
    await expect(blobs.put('../../etc/passwd', marker)).rejects.toThrow(/SHA-256/);
    await expect(blobs.read('ABC')).rejects.toThrow(/SHA-256/);
    expect(log.withOp('files.history.blob.put').at(-1)).toMatchObject({ level: 'debug' });
  });

  it('sweeps what no row names and the temporaries left, and keeps the rest', async () => {
    const other = Buffer.from('other');
    const otherHash = Etag.of(other).digest;
    await blobs.put(hash, marker);
    await blobs.put(otherHash, other);
    await writeFile(path.join(root, hash.slice(0, 2), `${hash}.abc.tmp`), 'half');
    await writeFile(path.join(root, 'not-a-shard'), 'left alone');

    expect(await blobs.sweep(new Set([hash]))).toBe(2);
    expect(await blobs.read(hash)).not.toBeNull();
    expect(await blobs.read(otherHash)).toBeNull();
    expect(await readdir(root)).toContain('not-a-shard');
  });

  it('sweeps nothing of a store nothing was kept in', async () => {
    await expect(
      new HistoryBlobDirectory(path.join(root, 'never'), log.logger).sweep(new Set()),
    ).resolves.toBe(0);
  });

  it('leaves no temporary behind when the disk refuses the write', async () => {
    const shard = path.join(root, hash.slice(0, 2));
    await mkdir(shard);
    await chmod(shard, 0o555);

    await expect(blobs.put(hash, marker)).rejects.toMatchObject({ code: 'EACCES' });
    expect(await readdir(shard)).toEqual([]);
    expect(log.withOp('files.history.blob.put').at(-1)).toMatchObject({ errorCode: 'EACCES' });
  });

  it('lets through what is not "nothing there" — a folder it may not look into', async () => {
    const shard = path.join(root, hash.slice(0, 2));
    await mkdir(shard);
    await chmod(shard, 0o000);

    await expect(blobs.put(hash, marker)).rejects.toMatchObject({ code: 'EACCES' });
    await expect(blobs.read(hash)).rejects.toMatchObject({ code: 'EACCES' });
    await expect(blobs.sweep(new Set())).rejects.toMatchObject({ code: 'EACCES' });
  });
});

import { createHash } from 'node:crypto';
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NodeUndoDisk } from '@adapter/outbound/checkpoint/node-undo.disk';
import { SessionId, TurnFileCheckpoint } from '@domain/session';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

/**
 * The disk the undo writes — plan 04, S-65 and S-66 — against a real filesystem.
 *
 * Real directories, real links and a real rename, because every one of these requirements is a
 * property of the filesystem and not of our code: a fake disk would prove that the fake refuses a
 * link, which is not the risk.
 */
describe('NodeUndoDisk', () => {
  let root: string;
  let store: string;
  let log: RecordingLogger;
  let disk: NodeUndoDisk;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'rc-undo-'));
    store = path.join(root, '.store');
    await mkdir(path.join(root, 'work'));
    await mkdir(store);
    log = new RecordingLogger();
    disk = new NodeUndoDisk(log.logger);
  });

  afterEach(async () => {
    await chmod(path.join(root, 'work'), 0o755).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });

  const at = (name: string): string => path.join(root, 'work', name);

  /** A snapshot of `content` kept for `target`, as the journal would have kept it. */
  async function snapshotOf(target: string, content: string): Promise<TurnFileCheckpoint> {
    const blobPath = path.join(store, digest(target));
    await writeFile(blobPath, content, 'utf8');

    return TurnFileCheckpoint.capture({
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      claudeSessionId: null,
      promptId: 'p1',
      path: target,
      existedBefore: 'present',
      blobPath,
      hash: digest(content),
      sizeBytes: content.length,
      restorable: 'yes',
      promptText: null,
      capturedAt: new Date(),
    });
  }

  describe('looking at a path', () => {
    it('hashes a plain file', async () => {
      await writeFile(at('a.md'), 'hello', 'utf8');

      expect(await disk.observe(at('a.md'))).toEqual({ kind: 'file', hash: digest('hello') });
    });

    it('says a missing file is absent', async () => {
      expect(await disk.observe(at('gone.md'))).toEqual({ kind: 'absent' });
    });

    it('refuses a path that became a symbolic link — S-65', async () => {
      await writeFile(path.join(root, 'outside.md'), 'not yours', 'utf8');
      await symlink(path.join(root, 'outside.md'), at('a.md'));

      expect(await disk.observe(at('a.md'))).toEqual({ kind: 'unsafe' });
    });

    it('refuses a path that became a hard link — S-65', async () => {
      await writeFile(path.join(root, 'outside.md'), 'not yours', 'utf8');
      await link(path.join(root, 'outside.md'), at('a.md'));

      expect(await disk.observe(at('a.md'))).toEqual({ kind: 'unsafe' });
    });

    it('refuses a path that became a directory — S-65', async () => {
      await mkdir(at('a.md'));

      expect(await disk.observe(at('a.md'))).toEqual({ kind: 'unsafe' });
    });

    it('refuses a path whose directory now resolves elsewhere — S-65', async () => {
      await mkdir(path.join(root, 'elsewhere'));
      await symlink(path.join(root, 'elsewhere'), at('linked'));

      expect(await disk.observe(path.join(at('linked'), 'a.md'))).toEqual({ kind: 'unsafe' });
    });

    it('refuses a path whose directory is gone, and a relative one', async () => {
      expect(await disk.observe(path.join(at('no-such-dir'), 'a.md'))).toEqual({ kind: 'unsafe' });
      expect(await disk.observe('work/a.md')).toEqual({ kind: 'unsafe' });
    });

    it('logs the path and what it is, never the contents', async () => {
      await writeFile(at('a.md'), 'a secret line', 'utf8');
      await disk.observe(at('a.md'));

      const [line] = log.withOp('checkpoint.observe');
      expect(line).toMatchObject({ level: 'debug', path: at('a.md'), kind: 'file' });
      expect(JSON.stringify(log.lines)).not.toContain('a secret line');
    });
  });

  describe('putting a file back', () => {
    it('writes the snapshot over the path, keeping its mode — S-37', async () => {
      await writeFile(at('a.md'), 'after', 'utf8');
      await chmod(at('a.md'), 0o600);
      const before = await snapshotOf(at('a.md'), 'before');

      const restored = await disk.restore(before);

      expect(await readFile(at('a.md'), 'utf8')).toBe('before');
      expect((await stat(at('a.md'))).mode & 0o777).toBe(0o600);
      expect(restored.sizeBytes).toBe('before'.length);
      expect(await readdir(path.join(root, 'work'))).toEqual(['a.md']);
    });

    it('puts back a file that is not there any more', async () => {
      const before = await snapshotOf(at('a.md'), 'before');

      await disk.restore(before);

      expect(await readFile(at('a.md'), 'utf8')).toBe('before');
    });

    it('leaves the file whole when the write fails halfway — S-66', async () => {
      await writeFile(at('a.md'), 'after', 'utf8');
      const before = await snapshotOf(at('a.md'), 'before');
      // Nothing may be created in the directory any more: the temporary cannot be written.
      await chmod(path.join(root, 'work'), 0o555);

      await expect(disk.restore(before)).rejects.toThrow();

      await chmod(path.join(root, 'work'), 0o755);
      expect(await readFile(at('a.md'), 'utf8')).toBe('after');
      expect(await readdir(path.join(root, 'work'))).toEqual(['a.md']);
      expect(log.withOp('checkpoint.restore')[0]).toMatchObject({ level: 'warn' });
    });

    it('refuses a snapshot that no longer matches its hash', async () => {
      await writeFile(at('a.md'), 'after', 'utf8');
      const before = await snapshotOf(at('a.md'), 'before');
      await writeFile(before.blobPath ?? '', 'tampered', 'utf8');

      await expect(disk.restore(before)).rejects.toThrow('no longer matches');
      expect(await readFile(at('a.md'), 'utf8')).toBe('after');
    });

    it('refuses a snapshot whose blob is gone', async () => {
      await writeFile(at('a.md'), 'after', 'utf8');
      const before = await snapshotOf(at('a.md'), 'before');
      await rm(before.blobPath ?? '');

      await expect(disk.restore(before)).rejects.toThrow();
      expect(await readFile(at('a.md'), 'utf8')).toBe('after');
    });

    it('refuses a checkpoint that kept nothing', async () => {
      const kept = await snapshotOf(at('a.md'), 'before');
      const nothing = TurnFileCheckpoint.capture({
        ...kept.snapshot(),
        blobPath: null,
        hash: null,
        restorable: 'tooLarge',
      });

      await expect(disk.restore(nothing)).rejects.toThrow('no snapshot');
    });

    it('never writes through a path that turned into a link since it was looked at — S-65', async () => {
      await writeFile(path.join(root, 'outside.md'), 'not yours', 'utf8');
      const before = await snapshotOf(at('a.md'), 'before');
      await symlink(path.join(root, 'outside.md'), at('a.md'));

      await expect(disk.restore(before)).rejects.toThrow('no longer a plain file');
      expect(await readFile(path.join(root, 'outside.md'), 'utf8')).toBe('not yours');
    });

    it('never writes into a directory that now resolves elsewhere — S-65', async () => {
      await mkdir(path.join(root, 'elsewhere'));
      await symlink(path.join(root, 'elsewhere'), at('linked'));
      const before = await snapshotOf(path.join(at('linked'), 'a.md'), 'before');

      await expect(disk.restore(before)).rejects.toThrow('no longer resolves');
      expect(await readdir(path.join(root, 'elsewhere'))).toEqual([]);
    });
  });

  describe('removing a file the turn created', () => {
    it('removes it', async () => {
      await writeFile(at('new.md'), 'created by the turn', 'utf8');

      await disk.remove(at('new.md'));

      expect(await disk.observe(at('new.md'))).toEqual({ kind: 'absent' });
    });

    it('is done when it is already gone', async () => {
      await expect(disk.remove(at('new.md'))).resolves.toBeUndefined();
    });

    it('never removes through a link — S-65', async () => {
      await writeFile(path.join(root, 'outside.md'), 'not yours', 'utf8');
      await symlink(path.join(root, 'outside.md'), at('new.md'));

      await expect(disk.remove(at('new.md'))).rejects.toThrow();
      expect(await readFile(path.join(root, 'outside.md'), 'utf8')).toBe('not yours');
    });
  });
});

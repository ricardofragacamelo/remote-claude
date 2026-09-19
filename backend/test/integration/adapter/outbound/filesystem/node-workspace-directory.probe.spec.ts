import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { NodeWorkspaceDirectoryProbe } from '@adapter/outbound/filesystem/node-workspace-directory.probe';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

/**
 * A real filesystem, because this adapter exists to talk to one.
 *
 * Stubbing `node:fs` here would leave the only thing worth proving untested: what `realpath`
 * actually does with a symlink, with a dangling link and with a loop.
 */
describe('NodeWorkspaceDirectoryProbe', () => {
  let base: string;
  let log: RecordingLogger;

  beforeAll(async () => {
    base = await mkdtemp(path.join(tmpdir(), 'rc-probe-'));

    await mkdir(path.join(base, 'root'));
    await mkdir(path.join(base, 'root', 'app'));
    await mkdir(path.join(base, 'outside'));
    await writeFile(path.join(base, 'root', 'readme.md'), 'x', 'utf8');
    await symlink(path.join(base, 'outside'), path.join(base, 'root', 'escape'));
    await symlink(path.join(base, 'root', 'app'), path.join(base, 'root', 'inward'));
    await symlink(path.join(base, 'root', 'readme.md'), path.join(base, 'root', 'to-file'));
    await symlink(path.join(base, 'nothing'), path.join(base, 'root', 'dangling'));
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  beforeEach(() => {
    log = new RecordingLogger();
  });

  const probe = (): NodeWorkspaceDirectoryProbe => new NodeWorkspaceDirectoryProbe(log.logger);

  it('reports a directory, resolved to itself', async () => {
    expect(await probe().inspect(path.join(base, 'root', 'app'))).toEqual({
      kind: 'present',
      realPath: path.join(base, 'root', 'app'),
      isDirectory: true,
    });
  });

  it('reports a file as present and not a directory — S-14', async () => {
    expect(await probe().inspect(path.join(base, 'root', 'readme.md'))).toMatchObject({
      kind: 'present',
      isDirectory: false,
    });
  });

  it('reports a path that is not there as missing — S-15', async () => {
    expect(await probe().inspect(path.join(base, 'root', 'gone'))).toEqual({ kind: 'missing' });
  });

  it('reports a dangling symlink as missing, not as present', async () => {
    expect(await probe().inspect(path.join(base, 'root', 'dangling'))).toEqual({ kind: 'missing' });
  });

  it('resolves a symlink to its target, which is what the rule has to check — S-12', async () => {
    // The whole point of the adapter: the name is inside the root and the target is not.
    expect(await probe().inspect(path.join(base, 'root', 'escape'))).toEqual({
      kind: 'present',
      realPath: path.join(base, 'outside'),
      isDirectory: true,
    });
  });

  it('resolves a symlink that stays inside the root', async () => {
    expect(await probe().inspect(path.join(base, 'root', 'inward'))).toMatchObject({
      realPath: path.join(base, 'root', 'app'),
      isDirectory: true,
    });
  });

  it('resolves a symlink pointing at a file', async () => {
    expect(await probe().inspect(path.join(base, 'root', 'to-file'))).toMatchObject({
      realPath: path.join(base, 'root', 'readme.md'),
      isDirectory: false,
    });
  });

  it('reports a path whose parent is a file as missing, not as an error', async () => {
    expect(await probe().inspect(path.join(base, 'root', 'readme.md', 'child'))).toEqual({
      kind: 'missing',
    });
  });

  it('logs both edges at debug, with the path and a duration', async () => {
    await probe().inspect(path.join(base, 'root', 'app'));

    expect(log.withOp('fs.inspect')).toHaveLength(1);
    expect(log.withOp('fs.inspected')[0]).toMatchObject({
      kind: 'present',
      durationMs: expect.any(Number),
    });
  });

  it('propagates a failure to look, instead of calling it missing', async () => {
    // Answering `missing` for a directory we were not allowed to look at would turn "I cannot
    // tell" into "it is not there", and the caller would report a `404` for something that exists.
    const unreadable = path.join(base, 'locked');
    await mkdir(unreadable, { recursive: true });
    await mkdir(path.join(unreadable, 'inner'), { recursive: true });
    await chmod(unreadable, 0o000);

    try {
      await expect(probe().inspect(path.join(unreadable, 'inner'))).rejects.toThrow();
      expect(log.withOp('fs.inspected')[0]).toMatchObject({ level: 'error' });
    } finally {
      await chmod(unreadable, 0o700);
    }
  });
});

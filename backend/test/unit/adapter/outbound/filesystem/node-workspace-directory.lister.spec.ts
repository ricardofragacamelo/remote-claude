import type { Dirent } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { NodeWorkspaceDirectoryLister } from '@adapter/outbound/filesystem/node-workspace-directory.lister';
import type { ListerFileSystem } from '@adapter/outbound/filesystem/node-workspace-directory.lister';
import { DirectoryListingCriteria } from '@domain/workspace';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

/**
 * The filesystems the real disk cannot be made to be, in a unit suite: an entry whose type the
 * filesystem did not report, and a failure nobody expects. The real disk is
 * test/integration/adapter/outbound/filesystem/node-workspace-directory.lister.spec.ts.
 */

const everything = new DirectoryListingCriteria(true, null);

/** A `Dirent` of a given kind — `unknown` answers false to every question, as some mounts do. */
function entry(name: string, kind: 'directory' | 'symlink' | 'file' | 'unknown'): Dirent {
  return {
    name,
    isDirectory: () => kind === 'directory',
    isSymbolicLink: () => kind === 'symlink',
    isFile: () => kind === 'file',
    isFIFO: () => false,
    isSocket: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
  } as unknown as Dirent;
}

async function* entries(list: readonly Dirent[]): AsyncIterable<Dirent> {
  for (const item of list) {
    yield await Promise.resolve(item);
  }
}

const failure = (code: string) => Object.assign(new Error(code), { code });

function fileSystem(overrides: Partial<ListerFileSystem>): ListerFileSystem {
  return {
    opendir: () => Promise.resolve(entries([])),
    lstat: () => Promise.reject(failure('ENOENT')),
    realpath: () => Promise.reject(failure('ENOENT')),
    stat: () => Promise.reject(failure('ENOENT')),
    ...overrides,
  };
}

describe('NodeWorkspaceDirectoryLister, beyond what a real disk shows', () => {
  it('asks the type of an entry the filesystem did not report, and lists a directory', async () => {
    const lister = new NodeWorkspaceDirectoryLister(
      new RecordingLogger().logger,
      fileSystem({
        opendir: () => Promise.resolve(entries([entry('mystery', 'unknown')])),
        lstat: () => Promise.resolve({ isDirectory: () => true, isSymbolicLink: () => false }),
      }),
    );

    expect(await lister.read('/srv/projects', everything, 10)).toEqual({
      kind: 'read',
      children: [{ kind: 'directory', name: 'mystery' }],
      exhausted: true,
    });
  });

  it('follows an untyped entry that turns out to be a link', async () => {
    const lister = new NodeWorkspaceDirectoryLister(
      new RecordingLogger().logger,
      fileSystem({
        opendir: () => Promise.resolve(entries([entry('link', 'unknown')])),
        lstat: () => Promise.resolve({ isDirectory: () => false, isSymbolicLink: () => true }),
        realpath: () => Promise.resolve('/srv/projects/target'),
        stat: () => Promise.resolve({ isDirectory: () => true }),
      }),
    );

    expect((await lister.read('/srv/projects', everything, 10)).kind).toBe('read');
  });

  it('leaves out an untyped entry that is gone by the time it is asked about', async () => {
    const lister = new NodeWorkspaceDirectoryLister(
      new RecordingLogger().logger,
      fileSystem({ opendir: () => Promise.resolve(entries([entry('gone', 'unknown')])) }),
    );

    expect(await lister.read('/srv/projects', everything, 10)).toEqual({
      kind: 'read',
      children: [],
      exhausted: true,
    });
  });

  it('leaves out a link to something that is not a directory', async () => {
    const lister = new NodeWorkspaceDirectoryLister(
      new RecordingLogger().logger,
      fileSystem({
        opendir: () => Promise.resolve(entries([entry('to-file', 'symlink')])),
        realpath: () => Promise.resolve('/srv/projects/readme.md'),
        stat: () => Promise.resolve({ isDirectory: () => false }),
      }),
    );

    expect(await lister.read('/srv/projects', everything, 10)).toEqual({
      kind: 'read',
      children: [{ kind: 'symlink', name: 'to-file', target: null }],
      exhausted: true,
    });
  });

  it('omits, and warns about, a link that fails for a reason nobody expects', async () => {
    const log = new RecordingLogger();
    const lister = new NodeWorkspaceDirectoryLister(
      log.logger,
      fileSystem({
        opendir: () => Promise.resolve(entries([entry('odd', 'symlink')])),
        realpath: () => Promise.reject(failure('EIO')),
      }),
    );

    const read = await lister.read('/srv/projects', everything, 10);

    expect(read).toMatchObject({ children: [{ name: 'odd', target: null }] });
    expect(log.lines.filter((line) => line.level === 'warn')).toHaveLength(1);
  });

  it('logs and re-throws a failure to open that is none of the expected ones', async () => {
    const log = new RecordingLogger();
    const lister = new NodeWorkspaceDirectoryLister(
      log.logger,
      fileSystem({ opendir: () => Promise.reject(failure('EMFILE')) }),
    );

    await expect(lister.read('/srv/projects', everything, 10)).rejects.toThrow('EMFILE');
    expect(log.withOp('fs.listed').length).toBeGreaterThan(0);
  });

  it('logs and re-throws a failure that carries no code at all', async () => {
    const lister = new NodeWorkspaceDirectoryLister(
      new RecordingLogger().logger,
      fileSystem({ opendir: () => Promise.reject(new Error('no code')) }),
    );

    await expect(lister.read('/srv/projects', everything, 10)).rejects.toThrow('no code');
  });
});

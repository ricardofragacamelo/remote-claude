import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  opendir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { NodeWorkspaceDirectoryLister } from '@adapter/outbound/filesystem/node-workspace-directory.lister';
import type { ListerFileSystem } from '@adapter/outbound/filesystem/node-workspace-directory.lister';
import type { DirectoryRead } from '@application/workspace';
import { DIRECTORY_LISTING_LIMIT, DirectoryListingCriteria } from '@domain/workspace';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

/**
 * A real filesystem, because this adapter exists to talk to one: what `opendir` hands over, what a
 * symlink, a loop, a socket and a folder with no permission actually are.
 */
describe('NodeWorkspaceDirectoryLister', () => {
  let base: string;
  let root: string;
  let log: RecordingLogger;
  let socket: Server;

  const visible = new DirectoryListingCriteria(false, null);
  const everything = new DirectoryListingCriteria(true, null);

  beforeAll(async () => {
    base = await realpath(await mkdtemp(path.join(tmpdir(), 'rc-lister-')));
    root = path.join(base, 'root');

    await mkdir(path.join(root, 'app'), { recursive: true });
    await mkdir(path.join(root, '.git'));
    await mkdir(path.join(base, 'outside'));
    await writeFile(path.join(root, 'readme.md'), 'x', 'utf8');
    await symlink(path.join(root, 'app'), path.join(root, 'inward'));
    await symlink(path.join(base, 'outside'), path.join(root, 'escape'));
    await symlink(path.join(root, 'readme.md'), path.join(root, 'to-file'));
    await symlink(path.join(base, 'nothing'), path.join(root, 'dangling'));
    await symlink(path.join(root, 'loop-b'), path.join(root, 'loop-a'));
    await symlink(path.join(root, 'loop-a'), path.join(root, 'loop-b'));
    execFileSync('mkfifo', [path.join(root, 'pipe')]);

    socket = createServer();
    await new Promise<void>((resolve) => {
      socket.listen(path.join(root, 'socket'), resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      socket.close(() => {
        resolve();
      });
    });
    await rm(base, { recursive: true, force: true });
  });

  beforeEach(() => {
    log = new RecordingLogger();
  });

  const lister = (fs?: ListerFileSystem): NodeWorkspaceDirectoryLister =>
    new NodeWorkspaceDirectoryLister(log.logger, fs);

  const namesOf = (read: DirectoryRead): string[] =>
    read.kind === 'read' ? read.children.map((child) => child.name).sort() : [];

  it('hands over directories and links, never a file, a fifo or a socket — plan 06, S-09', async () => {
    const read = await lister().read(root, everything, 100);

    expect(namesOf(read)).toEqual([
      '.git',
      'app',
      'dangling',
      'escape',
      'inward',
      'loop-a',
      'loop-b',
      'to-file',
    ]);
  });

  it('leaves out a hidden name unless asked for it — S-14', async () => {
    expect(namesOf(await lister().read(root, visible, 100))).not.toContain('.git');
  });

  it('resolves a link into the root to its real target — S-15', async () => {
    const read = await lister().read(root, visible, 100);

    expect(read.kind === 'read' && read.children.find((c) => c.name === 'inward')).toEqual({
      kind: 'symlink',
      name: 'inward',
      target: path.join(root, 'app'),
    });
  });

  it('reports where a link out of the root leads, for the rule to omit it — S-16', async () => {
    const read = await lister().read(root, visible, 100);

    expect(read.kind === 'read' && read.children.find((c) => c.name === 'escape')).toMatchObject({
      target: path.join(base, 'outside'),
    });
  });

  it('answers no target for a broken link, a loop and a link to a file, without hanging — S-17', async () => {
    const read = await lister().read(root, visible, 100);
    const targets = Object.fromEntries(
      read.kind === 'read'
        ? read.children
            .filter((child) => child.kind === 'symlink')
            .map((child) => [child.name, child.kind === 'symlink' ? child.target : undefined])
        : [],
    );

    expect(targets).toMatchObject({
      dangling: null,
      'loop-a': null,
      'loop-b': null,
      'to-file': null,
    });
  });

  it('hands names back intact — space, accent, emoji, line break — S-19', async () => {
    const odd = path.join(base, 'odd');
    const names = ['with space', 'ação', '🙂 emoji', 'line\nbreak'];

    for (const name of names) {
      await mkdir(path.join(odd, name), { recursive: true });
    }

    expect(namesOf(await lister().read(odd, visible, 100))).toEqual([...names].sort());
  });

  describe('permissions', () => {
    let closed: string;

    beforeAll(async () => {
      closed = path.join(base, 'closed');
      await mkdir(path.join(closed, 'inner'), { recursive: true });
      await mkdir(path.join(base, 'parent', 'locked'), { recursive: true });
      await chmod(closed, 0o000);
      await chmod(path.join(base, 'parent', 'locked'), 0o000);
    });

    afterAll(async () => {
      await chmod(closed, 0o755);
      await chmod(path.join(base, 'parent', 'locked'), 0o755);
    });

    it('answers unreadable for a directory this process may not open — S-25', async () => {
      expect(await lister().read(closed, visible, 100)).toEqual({ kind: 'unreadable' });
    });

    it('lists a subfolder it cannot read inside one it can — the refusal is for entering it — S-26', async () => {
      expect(namesOf(await lister().read(path.join(base, 'parent'), visible, 100))).toEqual([
        'locked',
      ]);
    });
  });

  it('answers missing for a directory that is gone, and not a directory for a file', async () => {
    expect(await lister().read(path.join(base, 'gone'), visible, 100)).toEqual({ kind: 'missing' });
    expect(await lister().read(path.join(root, 'readme.md'), visible, 100)).toEqual({
      kind: 'notADirectory',
    });
  });

  it('stops reading at the ceiling, whatever the size of the directory — S-12', async () => {
    const big = path.join(base, 'big');
    mkdirSync(big);
    for (let index = 0; index < 20_000; index += 1) {
      mkdirSync(path.join(big, `dir${String(index)}`));
    }

    let yielded = 0;
    const counting: ListerFileSystem = {
      lstat,
      realpath,
      stat,
      opendir: async (target) => {
        const directory = await opendir(target);
        return (async function* (): AsyncIterable<Dirent> {
          for await (const item of directory) {
            yielded += 1;
            yield item;
          }
        })();
      },
    };

    const read = await lister(counting).read(big, visible, DIRECTORY_LISTING_LIMIT + 1);

    expect(read).toMatchObject({ kind: 'read', exhausted: false });
    expect(read.kind === 'read' && read.children).toHaveLength(DIRECTORY_LISTING_LIMIT + 1);
    expect(yielded).toBe(DIRECTORY_LISTING_LIMIT + 1);
  });

  it('omits a link that vanishes between the read and its resolution, and goes on — S-28', async () => {
    const racing = path.join(base, 'racing');
    await mkdir(path.join(racing, 'kept'), { recursive: true });
    await symlink(path.join(racing, 'kept'), path.join(racing, 'vanishing'));

    const read = await lister({
      lstat,
      stat,
      opendir,
      realpath: async (link) => {
        await rm(link, { force: true });
        return realpath(link);
      },
    }).read(racing, visible, 100);

    expect(read.kind === 'read' && read.children).toEqual(
      expect.arrayContaining([
        { kind: 'directory', name: 'kept' },
        { kind: 'symlink', name: 'vanishing', target: null },
      ]),
    );
  });

  it('survives subfolders appearing and disappearing while it reads, without duplicates — S-29', async () => {
    const churn = path.join(base, 'churn');
    mkdirSync(churn);
    for (let index = 0; index < 2_000; index += 1) {
      mkdirSync(path.join(churn, `d${String(index)}`));
    }

    const writes = (async () => {
      for (let index = 0; index < 500; index += 1) {
        await mkdir(path.join(churn, `new${String(index)}`));
        await rm(path.join(churn, `d${String(index)}`), { recursive: true });
      }
    })();

    const [read] = await Promise.all([lister().read(churn, visible, 10_000), writes]);
    const names = namesOf(read);

    expect(read.kind).toBe('read');
    expect(new Set(names).size).toBe(names.length);
  });

  it('logs the path, the count, the cut and the time — and never a name — S-31', async () => {
    await lister().read(root, visible, 2);

    const lines = [...log.withOp('fs.list'), ...log.withOp('fs.listed')];
    expect(log.withOp('fs.listed')[0]).toMatchObject({
      path: root,
      count: 2,
      truncated: true,
      durationMs: expect.any(Number),
    });
    for (const name of ['app', 'inward', 'escape', 'dangling', 'loop-a']) {
      expect(JSON.stringify(lines)).not.toContain(`"${name}"`);
    }
  });
});

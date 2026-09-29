import { describe, expect, it } from 'vitest';

import { ListDirectoriesUseCase } from '@application/workspace';
import type { DirectoryRead, WorkspaceDirectoryProbe } from '@application/workspace';
import { UserId } from '@domain/auth';
import {
  DIRECTORY_LISTING_LIMIT,
  InvalidWorkspacePathError,
  WorkspaceDirectoryUnreadableError,
  WorkspaceForbiddenError,
  WorkspaceNotADirectoryError,
  WorkspaceNotAllowedError,
  WorkspaceNotFoundError,
} from '@domain/workspace';
import type { WorkspaceAllowlist } from '@domain/workspace';
import { anAllowlist, aWorkspace, OWNER } from '../../../support/builders/workspace.builder';
import { ScriptedDirectoryLister } from '../../../support/fakes/scripted-directory.lister';
import { StubDirectoryProbe } from '../../../support/fakes/stub-directory.probe';

const owner = UserId.create(OWNER);
const query = (path: string, overrides: { hidden?: boolean; prefix?: string | null } = {}) => ({
  path,
  hidden: overrides.hidden ?? false,
  prefix: overrides.prefix ?? null,
});

function build(
  options: {
    probe?: WorkspaceDirectoryProbe;
    lister?: ScriptedDirectoryLister;
    allowlist?: () => WorkspaceAllowlist;
    limit?: number;
  } = {},
): { useCase: ListDirectoriesUseCase; lister: ScriptedDirectoryLister } {
  const lister = options.lister ?? new ScriptedDirectoryLister();
  const allowlist = options.allowlist ?? (() => anAllowlist());

  return {
    lister,
    useCase: new ListDirectoriesUseCase(
      { current: allowlist },
      options.probe ?? StubDirectoryProbe.directories('/srv/projects', '/srv/projects/app'),
      lister,
      options.limit,
    ),
  };
}

const read = (answer: DirectoryRead) => new ScriptedDirectoryLister(answer);

describe('ListDirectoriesUseCase', () => {
  it('lists the subdirectories of a folder of this user — plan 06, S-08', async () => {
    const { useCase } = build({
      lister: read({
        kind: 'read',
        children: [
          { kind: 'directory', name: 'src' },
          { kind: 'directory', name: 'docs' },
        ],
        exhausted: true,
      }),
    });

    const listing = await useCase.execute(query('/srv/projects/app'), owner);

    expect(listing.entries.map((entry) => entry.name)).toEqual(['docs', 'src']);
    expect(listing.parent?.value).toBe('/srv/projects');
    expect(listing.truncated).toBe(false);
  });

  it('reads the real path, and one past the ceiling — plan 06, S-11, S-12', async () => {
    const probe = new StubDirectoryProbe({
      '/srv/projects/link': { kind: 'present', realPath: '/srv/projects/app', isDirectory: true },
    });
    const { useCase, lister } = build({ probe });

    await useCase.execute(query('/srv/projects/link'), owner);

    expect(lister.calls[0]).toMatchObject({
      path: '/srv/projects/app',
      limit: DIRECTORY_LISTING_LIMIT + 1,
    });
  });

  it('hands the lister the criteria it was asked for', async () => {
    const { useCase, lister } = build();

    await useCase.execute(query('/srv/projects/app', { hidden: true, prefix: 'Li' }), owner);

    const criteria = lister.calls[0]?.criteria;
    expect(criteria?.showHidden).toBe(true);
    expect(criteria?.admits('lib')).toBe(true);
    expect(criteria?.admits('src')).toBe(false);
  });

  it('answers truncated when the lister stopped at one past the ceiling', async () => {
    const children = ['a', 'b', 'c'].map((name) => ({ kind: 'directory' as const, name }));
    const { useCase } = build({
      lister: read({ kind: 'read', children, exhausted: false }),
      limit: 2,
    });

    const listing = await useCase.execute(query('/srv/projects/app'), owner);

    expect(listing.entries).toHaveLength(2);
    expect(listing.truncated).toBe(true);
  });

  it('answers a null parent at the root — plan 06, S-18', async () => {
    const { useCase } = build();

    expect((await useCase.execute(query('/srv/projects'), owner)).parent).toBeNull();
  });

  describe('refusals', () => {
    it('refuses a path outside every root without touching the disk — S-20', async () => {
      const probe = new StubDirectoryProbe();
      const { useCase, lister } = build({ probe });

      await expect(useCase.execute(query('/etc'), owner)).rejects.toThrow(WorkspaceNotAllowedError);
      expect(probe.asked).toEqual([]);
      expect(lister.calls).toEqual([]);
    });

    it('refuses a root of somebody else — S-21', async () => {
      const { useCase } = build();

      await expect(
        useCase.execute(query('/srv/projects/app'), UserId.create('auth|stranger')),
      ).rejects.toThrow(WorkspaceForbiddenError);
    });

    it('refuses a path that does not exist — S-22', async () => {
      const { useCase } = build({ probe: new StubDirectoryProbe() });

      await expect(useCase.execute(query('/srv/projects/gone'), owner)).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    });

    it('refuses a file — S-23', async () => {
      const probe = new StubDirectoryProbe({
        '/srv/projects/readme.md': {
          kind: 'present',
          realPath: '/srv/projects/readme.md',
          isDirectory: false,
        },
      });
      const { useCase, lister } = build({ probe });

      await expect(useCase.execute(query('/srv/projects/readme.md'), owner)).rejects.toThrow(
        WorkspaceNotADirectoryError,
      );
      expect(lister.calls).toEqual([]);
    });

    it('refuses a symlink whose real path leaves the root — S-24', async () => {
      const probe = new StubDirectoryProbe({
        '/srv/projects/escape': { kind: 'present', realPath: '/etc', isDirectory: true },
      });
      const { useCase, lister } = build({ probe });

      await expect(useCase.execute(query('/srv/projects/escape'), owner)).rejects.toThrow(
        WorkspaceNotAllowedError,
      );
      expect(lister.calls).toEqual([]);
    });

    it('refuses a path that is not a path', async () => {
      const { useCase } = build();

      await expect(useCase.execute(query('relative'), owner)).rejects.toThrow(
        InvalidWorkspacePathError,
      );
    });

    it('refuses a directory this process may not read — S-25', async () => {
      const { useCase } = build({ lister: read({ kind: 'unreadable' }) });

      await expect(useCase.execute(query('/srv/projects/app'), owner)).rejects.toThrow(
        WorkspaceDirectoryUnreadableError,
      );
    });

    it('answers not found for a directory that vanished between the check and the read', async () => {
      const { useCase } = build({ lister: read({ kind: 'missing' }) });

      await expect(useCase.execute(query('/srv/projects/app'), owner)).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    });

    it('answers not a directory for one replaced by a file in between', async () => {
      const { useCase } = build({ lister: read({ kind: 'notADirectory' }) });

      await expect(useCase.execute(query('/srv/projects/app'), owner)).rejects.toThrow(
        WorkspaceNotADirectoryError,
      );
    });
  });

  it('reads the allowlist at every call, never once — plan 06, S-32', async () => {
    let current = anAllowlist();
    const { useCase } = build({ allowlist: () => current });

    await useCase.execute(query('/srv/projects/app'), owner);
    current = anAllowlist([aWorkspace({ root: '/srv/other' })]);

    await expect(useCase.execute(query('/srv/projects/app'), owner)).rejects.toThrow(
      WorkspaceNotAllowedError,
    );
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import {
  CloseFolderUseCase,
  ListOpenFoldersUseCase,
  OpenFolderUseCase,
  ReorderOpenFoldersUseCase,
  RevalidatedFolders,
} from '@application/workspace';
import type { WorkspaceDirectoryProbe } from '@application/workspace';
import { UserId } from '@domain/auth';
import {
  InvalidWorkspacePathError,
  OpenFoldersLimitReachedError,
  OpenFoldersOrderConflictError,
  WorkspaceNotAllowedError,
} from '@domain/workspace';
import type { WorkspaceAllowlist } from '@domain/workspace';
import { anAllowlist, aWorkspace, OWNER } from '../../../support/builders/workspace.builder';
import {
  aFolder,
  minutesAfter,
  OPENED_AT,
} from '../../../support/builders/workspace-folder.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryWorkspaceFolderRepository } from '../../../support/fakes/in-memory-workspace-folder.repository';
import { StubDirectoryProbe } from '../../../support/fakes/stub-directory.probe';

const owner = UserId.create(OWNER);
const everyFolder = StubDirectoryProbe.directories(
  '/srv/projects',
  '/srv/projects/a',
  '/srv/projects/b',
  '/srv/projects/c',
);

describe('the folder tabs', () => {
  let folders: InMemoryWorkspaceFolderRepository;
  let clock: FixedClock;
  let allowlist: WorkspaceAllowlist;

  beforeEach(() => {
    folders = new InMemoryWorkspaceFolderRepository();
    clock = new FixedClock(OPENED_AT);
    allowlist = anAllowlist();
  });

  const opener = (probe: WorkspaceDirectoryProbe = everyFolder, limit = 8) =>
    new OpenFolderUseCase({ current: () => allowlist }, probe, folders, clock, {
      openFolders: limit,
      recentFolders: 20,
    });

  const lister = (probe: WorkspaceDirectoryProbe = everyFolder) =>
    new ListOpenFoldersUseCase(
      new RevalidatedFolders({ current: () => allowlist }, probe, folders),
    );

  describe('OpenFolderUseCase', () => {
    it('opens a new tab and records the folder as recent — plan 06, S-34', async () => {
      const opened = await opener().execute('/srv/projects/a', owner);

      expect(opened.created).toBe(true);
      expect(opened.view).toMatchObject({ rootLabel: 'Projects', state: 'available' });
      expect(opened.view.folder.snapshot()).toMatchObject({
        lastOpenedAt: OPENED_AT,
        tabPosition: 0,
      });
    });

    it('answers the tab already open, and moves its instant — S-35, S-41', async () => {
      await opener().execute('/srv/projects/a', owner);
      clock.set(minutesAfter(5));

      const again = await opener().execute('/srv/projects/a', owner);

      expect(again.created).toBe(false);
      expect(again.view.folder.lastOpenedAt).toEqual(minutesAfter(5));
      expect(folders.rows.size).toBe(1);
    });

    it('opens the real path, never the name that was sent', async () => {
      const probe = new StubDirectoryProbe({
        '/srv/projects/link': { kind: 'present', realPath: '/srv/projects/a', isDirectory: true },
      });

      const opened = await opener(probe).execute('/srv/projects/link', owner);

      expect(opened.view.folder.path.value).toBe('/srv/projects/a');
    });

    it('records nothing for a path the allowlist refuses — S-45', async () => {
      await expect(opener().execute('/etc', owner)).rejects.toThrow(WorkspaceNotAllowedError);

      expect(folders.rows.size).toBe(0);
    });

    it('refuses a new tab past the ceiling — S-43', async () => {
      await opener(everyFolder, 2).execute('/srv/projects/a', owner);
      await opener(everyFolder, 2).execute('/srv/projects/b', owner);

      await expect(opener(everyFolder, 2).execute('/srv/projects/c', owner)).rejects.toThrow(
        OpenFoldersLimitReachedError,
      );
    });

    it('does not pretend to have opened when the store fails — S-48', async () => {
      folders.failWith = new Error('connection terminated');

      await expect(opener().execute('/srv/projects/a', owner)).rejects.toThrow(
        'connection terminated',
      );
    });

    it('opens with the default ceilings when none are given', async () => {
      const opened = await new OpenFolderUseCase(
        { current: () => allowlist },
        everyFolder,
        folders,
        clock,
      ).execute('/srv/projects/a', owner);

      expect(opened.created).toBe(true);
    });
  });

  describe('ListOpenFoldersUseCase', () => {
    it('answers the tabs in their order, and only open ones', async () => {
      folders.put(aFolder({ path: '/srv/projects/b', tabPosition: 1 }));
      folders.put(aFolder({ path: '/srv/projects/a', tabPosition: 0 }));
      folders.put(aFolder({ path: '/srv/projects/c', tabPosition: null }));

      const tabs = await lister().execute(owner);

      expect(tabs.map((tab) => tab.folder.path.value)).toEqual([
        '/srv/projects/a',
        '/srv/projects/b',
      ]);
    });

    it('marks a tab whose folder left the allowlist, and one that left the disk — S-47', async () => {
      folders.put(aFolder({ path: '/srv/projects/a', tabPosition: 0 }));
      folders.put(aFolder({ path: '/srv/projects/gone', tabPosition: 1 }));
      folders.put(aFolder({ path: '/srv/other/x', root: '/srv/other', tabPosition: 2 }));

      const tabs = await lister().execute(owner);

      expect(tabs.map((tab) => [tab.folder.path.value, tab.state, tab.rootLabel])).toEqual([
        ['/srv/projects/a', 'available', 'Projects'],
        ['/srv/projects/gone', 'missing', 'Projects'],
        ['/srv/other/x', 'notAllowed', null],
      ]);
    });

    it('marks a tab under a root now declared for somebody else as not allowed', async () => {
      folders.put(aFolder({ path: '/srv/projects/a', tabPosition: 0 }));
      allowlist = anAllowlist([aWorkspace({ users: ['auth|somebody-else'] })]);

      const [tab] = await lister().execute(owner);

      expect(tab).toMatchObject({ state: 'notAllowed', rootLabel: null });
    });

    it('marks a folder that became a file as missing', async () => {
      folders.put(aFolder({ path: '/srv/projects/a', tabPosition: 0 }));
      const probe = new StubDirectoryProbe({
        '/srv/projects/a': { kind: 'present', realPath: '/srv/projects/a', isDirectory: false },
      });

      expect((await lister(probe).execute(owner))[0]?.state).toBe('missing');
    });

    it('fails rather than guess when the disk cannot be asked', async () => {
      folders.put(aFolder({ path: '/srv/projects/a', tabPosition: 0 }));
      const probe: WorkspaceDirectoryProbe = {
        inspect: () => Promise.reject(new Error('EIO')),
      };

      await expect(lister(probe).execute(owner)).rejects.toThrow('EIO');
    });
  });

  describe('CloseFolderUseCase', () => {
    it('closes the tab and keeps the folder on the recent list', async () => {
      folders.put(aFolder({ path: '/srv/projects/a', tabPosition: 0 }));

      await new CloseFolderUseCase(folders).execute('/srv/projects/a', owner);

      const [folder] = await folders.findByUser(owner);
      expect(folder?.isOpen).toBe(false);
      expect(folder?.isRecent).toBe(true);
    });

    it('changes nothing for a folder that is not open — S-42', async () => {
      await new CloseFolderUseCase(folders).execute('/srv/projects/a', owner);

      expect(folders.rows.size).toBe(0);
    });

    it('closes a tab whose folder left the allowlist — no gate stands in the way', async () => {
      folders.put(aFolder({ path: '/srv/other/x', root: '/srv/other', tabPosition: 0 }));

      await new CloseFolderUseCase(folders).execute('/srv/other/x', owner);

      expect((await folders.findByUser(owner))[0]?.isOpen).toBe(false);
    });

    it('refuses something that is not a path', async () => {
      await expect(new CloseFolderUseCase(folders).execute('x', owner)).rejects.toThrow(
        InvalidWorkspacePathError,
      );
    });
  });

  describe('ReorderOpenFoldersUseCase', () => {
    beforeEach(() => {
      folders.put(aFolder({ path: '/srv/projects/a', tabPosition: 0 }));
      folders.put(aFolder({ path: '/srv/projects/b', tabPosition: 1 }));
    });

    it('puts the tabs in the new order', async () => {
      await new ReorderOpenFoldersUseCase(folders).execute(
        ['/srv/projects/b', '/srv/projects/a'],
        owner,
      );

      const tabs = await lister().execute(owner);
      expect(tabs.map((tab) => tab.folder.path.value)).toEqual([
        '/srv/projects/b',
        '/srv/projects/a',
      ]);
    });

    it('refuses an order of some other set of tabs — S-44', async () => {
      await expect(
        new ReorderOpenFoldersUseCase(folders).execute(['/srv/projects/a'], owner),
      ).rejects.toThrow(OpenFoldersOrderConflictError);
    });
  });
});

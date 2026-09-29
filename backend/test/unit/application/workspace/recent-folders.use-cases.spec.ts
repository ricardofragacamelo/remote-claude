import { beforeEach, describe, expect, it } from 'vitest';

import {
  ForgetRecentFolderUseCase,
  ListRecentFoldersUseCase,
  PinRecentFolderUseCase,
  RevalidatedFolders,
} from '@application/workspace';
import { UserId } from '@domain/auth';
import { anAllowlist, OWNER } from '../../../support/builders/workspace.builder';
import { aFolder, minutesAfter } from '../../../support/builders/workspace-folder.builder';
import { InMemoryWorkspaceFolderRepository } from '../../../support/fakes/in-memory-workspace-folder.repository';
import { StubDirectoryProbe } from '../../../support/fakes/stub-directory.probe';

const owner = UserId.create(OWNER);
const stranger = UserId.create('auth|stranger');

describe('the recent folders', () => {
  let folders: InMemoryWorkspaceFolderRepository;

  beforeEach(() => {
    folders = new InMemoryWorkspaceFolderRepository();
  });

  const list = () =>
    new ListRecentFoldersUseCase(
      new RevalidatedFolders(
        { current: () => anAllowlist() },
        StubDirectoryProbe.directories('/srv/projects/a', '/srv/projects/b'),
        folders,
      ),
    ).execute(owner);

  describe('ListRecentFoldersUseCase', () => {
    it('answers pinned first, then newest first, each with its instant — plan 06, S-34', async () => {
      folders.put(aFolder({ path: '/srv/projects/a', lastOpenedAt: minutesAfter(1) }));
      folders.put(aFolder({ path: '/srv/projects/b', lastOpenedAt: minutesAfter(2) }));
      folders.put(
        aFolder({ path: '/srv/projects/p', lastOpenedAt: minutesAfter(0), pinned: true }),
      );

      const recent = await list();

      expect(recent.map((view) => [view.folder.path.value, view.lastOpenedAt])).toEqual([
        ['/srv/projects/p', minutesAfter(0)],
        ['/srv/projects/b', minutesAfter(2)],
        ['/srv/projects/a', minutesAfter(1)],
      ]);
    });

    it('never answers the folders of somebody else — S-36', async () => {
      folders.put(aFolder({ path: '/srv/projects/a', user: stranger.value }));

      expect(await list()).toEqual([]);
    });

    it('marks a folder that left the disk instead of dropping it — S-37', async () => {
      folders.put(aFolder({ path: '/srv/projects/a' }));
      folders.put(aFolder({ path: '/srv/projects/gone', lastOpenedAt: minutesAfter(1) }));

      const recent = await list();

      expect(recent.map((view) => [view.folder.path.value, view.state])).toEqual([
        ['/srv/projects/gone', 'missing'],
        ['/srv/projects/a', 'available'],
      ]);
    });
  });

  describe('PinRecentFolderUseCase — S-39', () => {
    it('pins and unpins a recent folder', async () => {
      folders.put(aFolder({ path: '/srv/projects/a' }));
      const pin = new PinRecentFolderUseCase(folders);

      await pin.execute('/srv/projects/a', true, owner);
      expect((await folders.findByUser(owner))[0]?.pinned).toBe(true);

      await pin.execute('/srv/projects/a', false, owner);
      expect((await folders.findByUser(owner))[0]?.pinned).toBe(false);
    });

    it('changes nothing pinning what is already pinned', async () => {
      folders.put(aFolder({ path: '/srv/projects/a', pinned: true }));

      await new PinRecentFolderUseCase(folders).execute('/srv/projects/a', true, owner);

      expect((await folders.findByUser(owner))[0]?.pinned).toBe(true);
    });

    it('leaves alone a folder that is not on the list', async () => {
      await new PinRecentFolderUseCase(folders).execute('/srv/projects/a', true, owner);

      expect(folders.rows.size).toBe(0);
    });
  });

  describe('ForgetRecentFolderUseCase — S-40', () => {
    it('takes a folder off the list', async () => {
      folders.put(aFolder({ path: '/srv/projects/a' }));

      await new ForgetRecentFolderUseCase(folders).execute('/srv/projects/a', owner);

      expect(await list()).toEqual([]);
    });

    it('changes nothing for one that is not there', async () => {
      await new ForgetRecentFolderUseCase(folders).execute('/srv/projects/a', owner);

      expect(folders.rows.size).toBe(0);
    });

    it('keeps the tab of an open folder open, off the list', async () => {
      folders.put(aFolder({ path: '/srv/projects/a', tabPosition: 0, pinned: true }));

      await new ForgetRecentFolderUseCase(folders).execute('/srv/projects/a', owner);

      const [folder] = await folders.findByUser(owner);
      expect(folder?.isOpen).toBe(true);
      expect(folder?.isRecent).toBe(false);
      expect(folder?.pinned).toBe(false);
    });
  });
});

import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { WorkspaceFolder, WorkspacePath } from '@domain/workspace';
import { aFolder, OPENED_AT } from '../../../../support/builders/workspace-folder.builder';

describe('WorkspaceFolder', () => {
  it('opens as recent, unpinned and with its tab closed', () => {
    const folder = WorkspaceFolder.opened(
      UserId.create('auth|owner'),
      WorkspacePath.create('/srv/projects/app'),
      WorkspacePath.create('/srv/projects'),
      OPENED_AT,
    );

    expect(folder.snapshot()).toMatchObject({
      lastOpenedAt: OPENED_AT,
      pinned: false,
      tabPosition: null,
    });
    expect(folder.isRecent).toBe(true);
    expect(folder.isOpen).toBe(false);
  });

  it('reads back what it was restored from', () => {
    const folder = aFolder({ pinned: true, tabPosition: 2 });

    expect(folder.userId.value).toBe('auth|owner');
    expect(folder.path.value).toBe('/srv/projects/app');
    expect(folder.root.value).toBe('/srv/projects');
    expect(folder.lastOpenedAt).toEqual(OPENED_AT);
    expect(folder.pinned).toBe(true);
    expect(folder.tabPosition).toBe(2);
    expect(folder.isOpen).toBe(true);
  });

  it('is open and not recent once taken off the list with its tab open', () => {
    const folder = aFolder({ lastOpenedAt: null, tabPosition: 0 });

    expect(folder.isRecent).toBe(false);
    expect(folder.isOpen).toBe(true);
  });

  it('hands out a copy of its state, never the state itself', () => {
    const folder = aFolder();

    expect(folder.snapshot()).not.toBe(folder.snapshot());
    expect(folder.snapshot()).toEqual(folder.snapshot());
  });
});

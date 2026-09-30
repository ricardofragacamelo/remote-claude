import { describe, expect, it } from 'vitest';

import { useFolderDialog } from '@/features/workspace';
import type { Workspace } from '@/features/workspace';

const projects: Workspace = { path: '/srv/projects', label: 'Projects', lastUsedAt: null };

describe('the one "Open folder" dialog — plan 06, D-28', () => {
  it('opens on the roots, or inside the root it was asked for', () => {
    useFolderDialog.getState().show();
    expect(useFolderDialog.getState()).toMatchObject({ open: true, startAt: null });

    useFolderDialog.getState().show(projects);
    expect(useFolderDialog.getState()).toMatchObject({ open: true, startAt: projects });
  });

  it('keeps where it starts while it stays open, and forgets it once closed', () => {
    useFolderDialog.getState().show(projects);

    useFolderDialog.getState().setOpen(true);
    expect(useFolderDialog.getState().startAt).toBe(projects);

    useFolderDialog.getState().setOpen(false);
    expect(useFolderDialog.getState()).toMatchObject({ open: false, startAt: null });
  });
});

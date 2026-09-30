import { describe, expect, it, vi } from 'vitest';

import { fileMenuOf } from '@/features/commands/hooks/file-menu';
import type { Command, FileMenuPlacement } from '@/features/commands';

function aCommand(id: string, fileMenu?: FileMenuPlacement): Command {
  return {
    id,
    labelKey: 'command.palette.show',
    category: 'file',
    run: vi.fn(),
    ...(fileMenu === undefined ? {} : { fileMenu }),
  };
}

describe('the File menu, out of the registry — plan 06, S-127, S-128', () => {
  it('orders the groups as the editor people know does, whatever the order of registering', () => {
    const sections = fileMenuOf([
      aCommand('workbench.closeFolderTab', { group: 'close', order: 200 }),
      aCommand('editor.save', { group: 'save', order: 100 }),
      aCommand('workspace.openFolder', { group: 'open', order: 100 }),
      aCommand('explorer.newFile', { group: 'new', order: 100 }),
    ]);

    expect(sections.map((section) => section.group)).toEqual(['new', 'open', 'save', 'close']);
  });

  it('leaves out a command nobody registered, and a group with nothing in it', () => {
    const sections = fileMenuOf([
      aCommand('workspace.openFolder', { group: 'open', order: 100 }),
      aCommand('palette.show'),
    ]);

    expect(sections).toEqual([
      { group: 'open', items: [expect.objectContaining({ id: 'workspace.openFolder' })] },
    ]);
  });

  it('shows the item the plan registers, in its place in the group', () => {
    const openRecent = aCommand('workspace.openRecent', { group: 'open', order: 200 });
    const openFolder = aCommand('workspace.openFolder', { group: 'open', order: 100 });
    const sameOrder = aCommand('a.first', { group: 'open', order: 200 });

    expect(
      fileMenuOf([openRecent, openFolder, sameOrder])[0]?.items.map((item) => item.id),
    ).toEqual(['workspace.openFolder', 'a.first', 'workspace.openRecent']);
  });

  it('is empty with nothing registered', () => {
    expect(fileMenuOf([])).toEqual([]);
  });
});

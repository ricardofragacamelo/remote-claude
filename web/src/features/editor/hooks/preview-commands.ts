import { Eye, PanelRight, SquareSplitHorizontal } from 'lucide-react';

import type { CommandDeclaration } from '@/features/commands';
import { activeGroupOf, activeTabOf } from '../lib/layout';
import { canPreview } from '../lib/preview-kinds';
import { editorStoreOf } from '../store/editor.store';
import type { PathTab } from '../types/editor';
import { openPreview, togglePreview } from './tabs';

/** The tab on screen in the group with the focus, when it shows one file — and that group. */
export function activePathTab(folder: string): { group: string; tab: PathTab } | null {
  const group = activeGroupOf(editorStoreOf(folder).getState());
  const tab = activeTabOf(group);

  return tab === undefined || tab.kind === 'diff' ? null : { group: group.id, tab };
}

/** The file on screen in an editor, when it has a preview. */
function previewable(folder: string): string | null {
  const active = activePathTab(folder);
  return active?.tab.kind === 'file' && canPreview(active.tab.path) ? active.tab.path : null;
}

/**
 * The commands of the previews (B-50): "Open preview" (`Ctrl+Shift+V`) and "Open preview to the side"
 * (`Ctrl+K V`), as the editor people know binds them, and the toggle of a tab between the file's
 * editor and its preview — in the palette with their keys (S-324).
 */
export function previewCommands(folder: string): CommandDeclaration[] {
  const open = (toSide: boolean) => () => {
    const path = previewable(folder);

    if (path !== null) {
      openPreview(folder, path, { toSide });
    }
  };

  return [
    {
      id: 'editor.openPreview',
      labelKey: 'command.editor.openPreview',
      category: 'view',
      icon: Eye,
      when: () => previewable(folder) !== null,
      run: open(false),
      keys: [{ key: 'Mod+Shift+V', context: 'workbench' }],
    },
    {
      id: 'editor.openPreviewToSide',
      labelKey: 'command.editor.openPreviewToSide',
      category: 'view',
      icon: PanelRight,
      when: () => previewable(folder) !== null,
      run: open(true),
      keys: [{ key: 'Mod+K V', context: 'workbench', allowInInput: true }],
    },
    {
      id: 'editor.togglePreview',
      labelKey: 'command.editor.togglePreview',
      category: 'view',
      icon: SquareSplitHorizontal,
      when: () => {
        const active = activePathTab(folder);
        return active !== null && canPreview(active.tab.path);
      },
      run: () => {
        const active = activePathTab(folder);

        if (active !== null) {
          togglePreview(folder, active.group, active.tab.id);
        }
      },
    },
  ];
}

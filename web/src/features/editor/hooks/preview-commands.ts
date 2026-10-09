import {
  Eye,
  PanelRight,
  Scan,
  Search,
  SquareSplitHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import type { CommandDeclaration, Keybinding } from '@/features/commands';
import { activeGroupOf, activeTabOf } from '../lib/layout';
import { canPreview } from '../lib/preview-kinds';
import { editorStoreOf } from '../store/editor.store';
import { activePdfReader } from '../store/pdf-readers';
import type { PdfReaderHandle } from '../store/pdf-readers';
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

/** Where the keys of the reader work: with the focus in it — and, for the zoom, the pointer. */
const FOCUS: readonly Keybinding['context'][] = ['pdfReader'];
const FOCUS_OR_POINTER: readonly Keybinding['context'][] = ['pdfReader', 'pdfPointer'];

/** The keys of a command of the reader, in each of its contexts. */
function readerKeys(
  key: string,
  contexts: readonly Keybinding['context'][],
): NonNullable<CommandDeclaration['keys']> {
  return contexts.map((context) => ({ key, context }));
}

/** A command of the PDF reader the person is at — from its keys, or from the palette. */
function readerCommand(
  id: string,
  labelKey: string,
  icon: NonNullable<CommandDeclaration['icon']>,
  act: (reader: PdfReaderHandle) => void,
  keys: NonNullable<CommandDeclaration['keys']>,
): CommandDeclaration {
  return {
    id,
    labelKey,
    category: 'view',
    icon,
    when: () => activePdfReader() !== null,
    run: () => {
      const reader = activePdfReader();
      if (reader !== null) act(reader);
    },
    keys,
  };
}

/**
 * The commands of the PDF reader (plan 21): find in it (`Ctrl+F`, only with the focus in it — D-10),
 * and its zoom (`Ctrl+=`, `Ctrl+-`, `Ctrl+0`, with the focus or the pointer in it — S-14), in the
 * palette and the help with their keys. They act on the reader reached last.
 */
export function pdfReaderCommands(): CommandDeclaration[] {
  return [
    readerCommand(
      'editor.pdf.find',
      'command.editor.pdfFind',
      Search,
      (reader) => {
        reader.openFind();
      },
      readerKeys('Mod+F', FOCUS),
    ),
    readerCommand(
      'editor.pdf.zoomIn',
      'command.editor.pdfZoomIn',
      ZoomIn,
      (reader) => {
        reader.zoomIn();
      },
      readerKeys('Mod+=', FOCUS_OR_POINTER),
    ),
    readerCommand(
      'editor.pdf.zoomOut',
      'command.editor.pdfZoomOut',
      ZoomOut,
      (reader) => {
        reader.zoomOut();
      },
      readerKeys('Mod+-', FOCUS_OR_POINTER),
    ),
    readerCommand(
      'editor.pdf.zoomReset',
      'command.editor.pdfZoomReset',
      Scan,
      (reader) => {
        reader.zoomReset();
      },
      readerKeys('Mod+0', FOCUS_OR_POINTER),
    ),
  ];
}

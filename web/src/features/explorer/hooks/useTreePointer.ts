import { useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';

import {
  FILES_DRAG_TYPE,
  filesDragPayload,
  readFilesDrag,
  writeFilesDrag,
} from '@/shared/lib/files-drag';
import { carriesDesktopFiles } from '../lib/dropped-files';
import { indexOfKey, rangeOf } from '../lib/tree-navigation';
import type { EntryRow } from '../lib/tree-rows';
import { explorerStore } from '../store/explorer.store';
import { candidateOf } from './useExplorer';
import type { Explorer } from './useExplorer';

/** What a drop target listens to. */
export interface DropHandlers {
  onDragOver(event: DragEvent): void;
  onDragLeave(): void;
  onDrop(event: DragEvent): void;
}

/** What the mouse — and a finger — does in the tree. */
export interface TreePointer {
  /** The folder a drag is over, to be shown as the place it would land. */
  readonly dropTarget: string | null;

  /** A click: selects — `Shift` a range, `Ctrl`/`⌘` one more — and a plain click opens a preview. */
  click(row: EntryRow, event: MouseEvent): void;

  /** A right click on a row that is not selected selects it — the menu acts on what it points at. */
  pointAt(row: EntryRow): void;
  dragStart(row: EntryRow, event: DragEvent): void;

  /** The handlers that make a folder — `''`, the open one — a place to drop entries in. */
  dropOn(destination: string): DropHandlers;
}

/** Whether a drag carries entries of a tree — the only thing the tree takes. */
function carriesEntries(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(FILES_DRAG_TYPE);
}

/**
 * The pointer in the tree: selecting, opening, and dragging — a row, or the whole selection in the
 * order of the tree, as a typed payload that moves entries into a folder here and carries them to
 * Claude's chat there (D-20, S-269, S-270). A drag ends in a move only when it is dropped on a folder
 * of the same tab; given up, it publishes nothing (S-279).
 */
export function useTreePointer(explorer: Explorer): TreePointer {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const folder = explorer.folder;
  const rows = explorer.tree.rows;

  return {
    dropTarget,
    click: (row, event) => {
      const store = explorerStore(folder).getState();

      if (event.shiftKey) {
        store.select(
          rangeOf(rows, indexOfKey(rows, store.anchor), rows.indexOf(row)),
          row.key,
          store.anchor,
        );
      } else if (event.ctrlKey || event.metaKey) {
        const without = store.selection.filter((path) => path !== row.path);
        store.select(
          without.length < store.selection.length ? without : [...store.selection, row.path],
          row.key,
        );
      } else {
        store.select([row.path], row.key);
        explorer.open(row, { preview: true });
      }
    },
    pointAt: (row) => {
      const store = explorerStore(folder).getState();

      if (!store.selection.includes(row.path)) {
        store.select([row.path], row.key);
      }
    },
    dragStart: (row, event) => {
      const selection = explorerStore(folder).getState().selection;
      const dragged = selection.includes(row.path)
        ? explorer.targets.filter((each) => selection.includes(each.path))
        : [row];
      const { payload } = filesDragPayload(folder, dragged.map(candidateOf));

      if (payload === null) {
        event.preventDefault();
        return;
      }

      writeFilesDrag(event.dataTransfer, payload);
      event.dataTransfer.effectAllowed = 'copyMove';
    },
    dropOn: (destination) => ({
      onDragOver: (event) => {
        const entries = carriesEntries(event);

        // Entries of this tree move; files from the desktop are uploaded into the folder (S-318).
        if (entries || carriesDesktopFiles(event.dataTransfer)) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = entries ? 'move' : 'copy';
          setDropTarget(destination);
        }
      },
      onDragLeave: () => {
        setDropTarget(null);
      },
      onDrop: (event) => {
        setDropTarget(null);
        const payload = readFilesDrag(event.dataTransfer);

        if (payload === null && carriesDesktopFiles(event.dataTransfer)) {
          event.preventDefault();
          event.stopPropagation();
          explorer.transfer.drop(destination, event.dataTransfer);
          return;
        }

        if (payload === null || payload.folder !== folder) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        explorer.moveInto(
          payload.entries.map((entry) => entry.path),
          destination,
        );
      },
    }),
  };
}

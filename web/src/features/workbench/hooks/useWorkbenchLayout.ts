import { useCallback } from 'react';
import { useStore } from 'zustand';

import { folderTabStore } from '../store/folder-tab.store';
import type { WorkbenchLayout } from './workbench-layout';

/** What the panels report once a layout settled: the sizes, and whether a person moved them. */
export type LayoutReport = (
  sizes: Readonly<Record<string, number>>,
  meta: { readonly isUserInteraction: boolean },
) => void;

/** The sizes of one folder tab, and the ways to keep new ones. */
export interface WorkbenchLayoutControl {
  readonly layout: WorkbenchLayout;

  /** Keeps the sizes a drag left — a part the drag did not report keeps its own. */
  save(change: SizeChange): void;

  /** Keeps the columns a person dragged — never a layout the library settled on its own. */
  readonly columnsChanged: LayoutReport;

  /** Keeps the height of the panel a person dragged. */
  readonly rowsChanged: LayoutReport;
}

/** Sizes as the panels report them: any of them, each maybe absent. */
export type SizeChange = Readonly<Partial<Record<keyof WorkbenchLayout, number | undefined>>>;

/** The sizes that were reported. */
function reported(change: SizeChange): Partial<WorkbenchLayout> {
  return Object.fromEntries(Object.entries(change).filter((entry) => entry[1] !== undefined));
}

/**
 * The sizes of the parts of one folder tab — in its store, by its real path, so two folders never
 * share them (S-99).
 *
 * A convenience of this browser: the layout of a phone is not the one of a desktop, so it never
 * goes to the server. What keeps them across a reload is the tab's restoration, with the rest of its
 * layout (S-134); a kept value that does not read as sizes is the initial ones, with no error
 * (docs/architecture/web/04-state-and-data.md#estado-de-aba-de-pasta).
 */
export function useWorkbenchLayout(path: string): WorkbenchLayoutControl {
  const store = folderTabStore(path);
  const layout = useStore(store, (state) => state.sizes);

  const save = useCallback(
    (change: SizeChange) => {
      store.getState().resize(reported(change));
    },
    [store],
  );

  // A layout the library settles on its own — a mount, a window resized — is not a choice anybody
  // made, and keeping it would replace one that was.
  const columnsChanged = useCallback<LayoutReport>(
    (columns, meta) => {
      if (meta.isUserInteraction) {
        save({ sideBar: columns['sideBar'], secondary: columns['secondary'] });
      }
    },
    [save],
  );

  const rowsChanged = useCallback<LayoutReport>(
    (rows, meta) => {
      if (meta.isUserInteraction) {
        save({ panel: rows['panel'] });
      }
    },
    [save],
  );

  return { layout, save, columnsChanged, rowsChanged };
}

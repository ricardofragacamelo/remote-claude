import {
  ArrowDownUp,
  ChevronsDownUp,
  CircleHelp,
  ClipboardCopy,
  ClipboardPaste,
  Columns2,
  Copy,
  CopyPlus,
  Eye,
  FilePlus,
  FileStack,
  FolderInput,
  FolderOpen,
  FolderPlus,
  GitCompare,
  LayoutTemplate,
  ListFilter,
  Link,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Scissors,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { CommandDeclaration, FileMenuPlacement, Keybinding } from '@/features/commands';
import { isOperable } from '../lib/sort';
import { SORT_ORDERS } from '../types/explorer';
import type { SortOrder } from '../types/explorer';
import { transferActions } from './transfer-actions';
import type { Explorer } from './useExplorer';

/** Where an action sits in the context menu of the tree — separated by group, in this order. */
export type ActionGroup = 'new' | 'open' | 'transfer' | 'edit' | 'path' | 'claude';

/** One thing the Explorer does: in its context menu, in the palette, on a shortcut (S-180). */
export interface ExplorerAction {
  /** The command id — `explorer.<what>`. */
  readonly id: string;

  /** A translation key, named in full here. */
  readonly labelKey: string;
  readonly icon: LucideIcon;

  /** In the context menu of the tree, in this group; absent for what only the toolbar shows. */
  readonly group?: ActionGroup;

  /** Whether it can act now — on what is selected, with what is aside. */
  available(): boolean;
  run(): void;
  readonly keys?: readonly Omit<Keybinding, 'command'>[];
  readonly fileMenu?: FileMenuPlacement;
}

/** A shortcut that answers only with the focus in the tree — `Delete` deletes files there and nowhere else. */
function inTree(key: string, mac?: string): Omit<Keybinding, 'command'> {
  return { key, context: 'explorer', ...(mac === undefined ? {} : { mac }) };
}

/** The name of each order of the tree — named in full so the i18n check sees each key. */
export const SORT_KEYS: Readonly<Record<SortOrder, string>> = {
  name: 'explorer.action.sortByName',
  type: 'explorer.action.sortByType',
  modified: 'explorer.action.sortByModified',
};

/** The actions that make something new — in the File menu too (S-13). */
function creating(explorer: Explorer): ExplorerAction[] {
  const single = explorer.targets.length === 1 ? explorer.targets[0] : undefined;

  return [
    {
      id: 'explorer.newFile',
      labelKey: 'explorer.action.newFile',
      icon: FilePlus,
      group: 'new',
      available: () => true,
      run: () => {
        explorer.newEntry('file');
      },
      keys: [inTree('Alt+N')],
      fileMenu: { group: 'new', order: 100 },
    },
    {
      id: 'explorer.newFolder',
      labelKey: 'explorer.action.newFolder',
      icon: FolderPlus,
      group: 'new',
      available: () => true,
      run: () => {
        explorer.newEntry('directory');
      },
      keys: [inTree('Shift+Alt+N')],
      fileMenu: { group: 'new', order: 110 },
    },
    {
      id: 'explorer.newFromTemplate',
      labelKey: 'explorer.action.newFromTemplate',
      icon: LayoutTemplate,
      group: 'new',
      available: () => true,
      run: () => {
        explorer.chooseTemplate(true);
      },
      keys: [inTree('Alt+T')],
      fileMenu: { group: 'new', order: 120 },
    },
    {
      id: 'explorer.newFromFile',
      labelKey: 'explorer.action.newFromFile',
      icon: FileStack,
      group: 'new',
      available: () => single?.entry.kind === 'file' && isOperable(single.entry),
      run: explorer.newFromFile,
      keys: [inTree('Shift+Alt+T')],
      fileMenu: { group: 'new', order: 130 },
    },
  ];
}

/** The actions that open what is selected. */
function opening(explorer: Explorer): ExplorerAction[] {
  const [first, second] = explorer.targets;
  const files = explorer.targets.filter(
    (row) => row.entry.kind === 'file' && isOperable(row.entry),
  );

  return [
    {
      id: 'explorer.open',
      labelKey: 'explorer.action.open',
      icon: FolderOpen,
      group: 'open',
      available: () => first !== undefined && explorer.targets.length === 1,
      run: () => {
        if (first !== undefined) {
          explorer.open(first);
        }
      },
      keys: [inTree('Enter')],
    },
    {
      id: 'explorer.openToSide',
      labelKey: 'explorer.action.openToSide',
      icon: Columns2,
      group: 'open',
      available: () => files.length === 1 && explorer.targets.length === 1,
      run: explorer.openToSide,
      keys: [inTree('Mod+Enter')],
    },
    {
      id: 'explorer.compareSelected',
      labelKey: 'explorer.action.compareSelected',
      icon: GitCompare,
      group: 'open',
      available: () => files.length === 2 && second !== undefined && explorer.targets.length === 2,
      run: explorer.compare,
      keys: [inTree('Alt+K')],
    },
  ];
}

/** The actions that change entries. */
function editing(explorer: Explorer): ExplorerAction[] {
  const some = explorer.targets.some((row) => !row.entry.unreadableName);
  const one =
    explorer.targets.length === 1 && explorer.targets.every((row) => isOperable(row.entry));

  return [
    edit(
      'explorer.cut',
      'explorer.action.cut',
      Scissors,
      some,
      () => {
        explorer.copy('cut');
      },
      'Mod+X',
    ),
    edit(
      'explorer.copy',
      'explorer.action.copy',
      Copy,
      some,
      () => {
        explorer.copy('copy');
      },
      'Mod+C',
    ),
    edit(
      'explorer.paste',
      'explorer.action.paste',
      ClipboardPaste,
      explorer.state.clipboard !== null,
      explorer.paste,
      'Mod+V',
    ),
    edit(
      'explorer.duplicate',
      'explorer.action.duplicate',
      CopyPlus,
      some,
      explorer.duplicate,
      'Mod+D',
    ),
    edit('explorer.moveTo', 'explorer.action.moveTo', FolderInput, some, explorer.askMove, 'Alt+M'),
    edit('explorer.rename', 'explorer.action.rename', Pencil, one, explorer.rename, 'F2'),
    {
      ...edit('explorer.delete', 'explorer.action.delete', Trash2, some, explorer.remove, 'Delete'),
      keys: [inTree('Delete', 'Meta+Backspace')],
    },
    edit(
      'explorer.undo',
      'explorer.action.undo',
      Undo2,
      explorer.state.undo.length > 0,
      explorer.undo,
      'Mod+Z',
    ),
  ];
}

function edit(
  id: string,
  labelKey: string,
  icon: LucideIcon,
  available: boolean,
  run: () => void,
  key: string,
): ExplorerAction {
  return {
    id,
    labelKey,
    icon,
    group: 'edit',
    available: () => available,
    run,
    keys: [inTree(key)],
  };
}

/** The actions on paths and on Claude's context. */
function pointing(explorer: Explorer): ExplorerAction[] {
  const some = explorer.targets.some((row) => !row.entry.unreadableName);
  const forClaude = explorer.targets.some((row) => isOperable(row.entry));

  return [
    {
      id: 'explorer.copyPath',
      labelKey: 'explorer.action.copyPath',
      icon: ClipboardCopy,
      group: 'path',
      available: () => some,
      run: () => {
        explorer.copyPath(true);
      },
      keys: [inTree('Shift+Alt+C')],
    },
    {
      id: 'explorer.copyRelativePath',
      labelKey: 'explorer.action.copyRelativePath',
      icon: Link,
      group: 'path',
      available: () => some,
      run: () => {
        explorer.copyPath(false);
      },
      keys: [inTree('Mod+Shift+Alt+C')],
    },
    {
      id: 'explorer.addToContext',
      labelKey: 'explorer.action.addToContext',
      icon: MessageSquarePlus,
      group: 'claude',
      // Only with somebody to take it: the panel of plan 08 (S-276).
      available: () => explorer.claudeTakesFiles && forClaude,
      run: explorer.addToContext,
      keys: [inTree('Shift+Alt+A')],
    },
  ];
}

/** The actions on the view itself — the toolbar's, and the palette's. */
function viewing(explorer: Explorer): ExplorerAction[] {
  const store = explorer.state;

  return [
    {
      id: 'explorer.refresh',
      labelKey: 'explorer.action.refresh',
      icon: RefreshCw,
      available: () => true,
      run: explorer.refresh,
      keys: [inTree('Alt+R')],
    },
    {
      id: 'explorer.collapseAll',
      labelKey: 'explorer.action.collapseAll',
      icon: ChevronsDownUp,
      available: () => true,
      run: store.collapseAll,
      keys: [inTree('Shift+Alt+ArrowUp')],
    },
    {
      id: 'explorer.toggleHidden',
      labelKey: store.showHidden ? 'explorer.action.hideHidden' : 'explorer.action.showHidden',
      icon: Eye,
      available: () => true,
      run: () => {
        store.setShowHidden(!store.showHidden);
      },
      keys: [inTree('Shift+Alt+H')],
    },
    {
      id: 'explorer.filter',
      labelKey: 'explorer.action.filter',
      icon: ListFilter,
      available: () => true,
      run: store.requestFilter,
      keys: [inTree('Shift+Alt+F')],
    },
    {
      id: 'explorer.toggleCompact',
      labelKey: store.compact ? 'explorer.action.expandCompact' : 'explorer.action.compact',
      icon: ArrowDownUp,
      available: () => true,
      run: () => {
        store.setCompact(!store.compact);
      },
    },
    ...SORT_ORDERS.map((order): ExplorerAction => ({
      id: `explorer.sortBy.${order}`,
      labelKey: SORT_KEYS[order],
      icon: ArrowDownUp,
      available: () => store.sort !== order,
      run: () => {
        store.setSort(order);
      },
    })),
    {
      id: 'explorer.showHelp',
      labelKey: 'explorer.action.help',
      icon: CircleHelp,
      available: () => true,
      run: () => {
        explorer.setHelpOpen(true);
      },
    },
  ];
}

/**
 * Every action of the Explorer, once: the context menu shows the grouped ones, the palette and the
 * File menu all of them through the registry of commands, with the same label and the same key
 * (S-180, S-201).
 */
export function explorerActions(explorer: Explorer): ExplorerAction[] {
  return [
    ...creating(explorer),
    ...opening(explorer),
    ...transferActions(explorer),
    ...editing(explorer),
    ...pointing(explorer),
    ...viewing(explorer),
  ];
}

/** The actions as commands of the registry — category `file`, as the palette files them. */
export function asCommands(actions: readonly ExplorerAction[]): CommandDeclaration[] {
  return actions.map((action) => ({
    id: action.id,
    labelKey: action.labelKey,
    category: 'file',
    icon: action.icon,
    when: action.available,
    run: action.run,
    ...(action.keys === undefined ? {} : { keys: action.keys }),
    ...(action.fileMenu === undefined ? {} : { fileMenu: action.fileMenu }),
  }));
}

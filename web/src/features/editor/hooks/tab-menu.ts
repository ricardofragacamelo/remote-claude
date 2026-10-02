import {
  ArrowLeft,
  ArrowRight,
  Columns2,
  FileDiff,
  FolderSearch,
  MessageSquarePlus,
  Pin,
  PinOff,
  X,
  XSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { editorStoreOf } from '../store/editor.store';
import type { EditorTab } from '../types/editor';
import {
  activateTab,
  closeTabs,
  moveTab,
  openDiff,
  openFile,
  setPinned,
  tabsToClose,
} from './tabs';
import { addFileToClaude } from './text-actions';

/** One thing an editor tab's menu offers. */
export interface EditorTabAction {
  readonly id: string;

  /** A translation key, named in full here. */
  readonly labelKey: string;
  readonly icon: LucideIcon;
  readonly disabled: boolean;
  run(): void;
}

/** What the menu needs to know besides the tab. */
export interface TabMenuContext {
  readonly folder: string;
  readonly group: string;
  readonly dirty: boolean;

  /** Somebody takes files into Claude's context — the panel of plan 08 (S-276). */
  readonly claude: boolean;

  /** "Reveal in explorer" — the explorer's command, when it is registered. */
  reveal: (() => void) | null;
}

function closeActions(tab: EditorTab, { folder, group }: TabMenuContext): EditorTabAction[] {
  const state = editorStoreOf(folder).getState();
  const close =
    (which: 'others' | 'right' | 'saved' | 'all'): EditorTabAction['run'] =>
    () => {
      closeTabs(folder, group, tabsToClose(editorStoreOf(folder).getState(), group, tab.id, which));
    };
  const none = (which: 'others' | 'right' | 'saved' | 'all') =>
    tabsToClose(state, group, tab.id, which).length === 0;

  return [
    {
      id: 'close',
      labelKey: 'editor.tabMenu.close',
      icon: X,
      disabled: false,
      run: () => {
        closeTabs(folder, group, [tab.id]);
      },
    },
    {
      id: 'closeOthers',
      labelKey: 'editor.tabMenu.closeOthers',
      icon: XSquare,
      disabled: none('others'),
      run: close('others'),
    },
    {
      id: 'closeRight',
      labelKey: 'editor.tabMenu.closeRight',
      icon: XSquare,
      disabled: none('right'),
      run: close('right'),
    },
    {
      id: 'closeSaved',
      labelKey: 'editor.tabMenu.closeSaved',
      icon: XSquare,
      disabled: none('saved'),
      run: close('saved'),
    },
    {
      id: 'closeAll',
      labelKey: 'editor.tabMenu.closeAll',
      icon: XSquare,
      disabled: none('all'),
      run: close('all'),
    },
  ];
}

function placeActions(tab: EditorTab, { folder, group }: TabMenuContext): EditorTabAction[] {
  const tabs =
    editorStoreOf(folder)
      .getState()
      .groups.find((each) => each.id === group)?.tabs ?? [];
  const at = tabs.findIndex((each) => each.id === tab.id);

  return [
    {
      id: 'pin',
      labelKey: tab.pinned ? 'editor.tabMenu.unpin' : 'editor.tabMenu.pin',
      icon: tab.pinned ? PinOff : Pin,
      disabled: false,
      run: () => {
        setPinned(folder, group, tab.id, !tab.pinned);
      },
    },
    {
      id: 'moveLeft',
      labelKey: 'editor.tabMenu.moveLeft',
      icon: ArrowLeft,
      disabled: at <= 0,
      run: () => {
        moveTab(folder, group, tab.id, { by: -1 });
      },
    },
    {
      id: 'moveRight',
      labelKey: 'editor.tabMenu.moveRight',
      icon: ArrowRight,
      disabled: at === tabs.length - 1,
      run: () => {
        moveTab(folder, group, tab.id, { by: 1 });
      },
    },
  ];
}

function fileActions(tab: EditorTab, context: TabMenuContext): EditorTabAction[] {
  if (tab.kind !== 'file') {
    return [];
  }

  const { folder, group, dirty, claude, reveal } = context;
  const path = tab.path;

  return [
    {
      id: 'openToSide',
      labelKey: 'editor.tabMenu.openToSide',
      icon: Columns2,
      disabled: false,
      run: () => {
        openFile(folder, path, { toSide: true });
      },
    },
    {
      id: 'compareWithSaved',
      labelKey: 'editor.tabMenu.compareWithSaved',
      icon: FileDiff,
      disabled: !dirty,
      run: () => {
        openDiff(folder, { path, source: 'disk' }, { path, source: 'buffer' });
      },
    },
    ...(reveal === null
      ? []
      : [
          {
            id: 'reveal',
            labelKey: 'editor.tabMenu.reveal',
            icon: FolderSearch,
            disabled: false,
            run: () => {
              activateTab(folder, group, tab.id);
              reveal();
            },
          },
        ]),
    // Only while somebody takes it: without Claude's panel, the item does not exist (S-276).
    ...(claude
      ? [
          {
            id: 'addToClaude',
            labelKey: 'editor.tabMenu.addToClaude',
            icon: MessageSquarePlus,
            disabled: false,
            run: () => {
              addFileToClaude(folder, path, []);
            },
          },
        ]
      : []),
  ];
}

/**
 * What an editor tab's menu offers, in its sections: closing (this one, the others, to the right,
 * the saved ones, all — never a pinned one but itself, S-212), its place (pin, move, S-213), and the
 * file (open to the side, compare with saved, reveal in the explorer, add to Claude's context).
 */
export function tabMenuOf(
  tab: EditorTab,
  context: TabMenuContext,
): readonly (readonly EditorTabAction[])[] {
  return [closeActions(tab, context), placeActions(tab, context), fileActions(tab, context)].filter(
    (section) => section.length > 0,
  );
}

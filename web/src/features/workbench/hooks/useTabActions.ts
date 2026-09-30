import { ArrowLeft, ArrowRight, Copy, X, XSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { FolderTab } from '../types/workbench';
import type { FolderTabs } from './useFolderTabs';

/** One thing a folder tab's menu offers. */
export interface TabAction {
  readonly id: 'close' | 'closeOthers' | 'closeRight' | 'moveLeft' | 'moveRight' | 'copyPath';

  /** A translation key, named in full here. */
  readonly labelKey: string;
  readonly icon: LucideIcon;

  /** Nothing to do — no other tab to close, no place to move to. */
  readonly disabled: boolean;
  run(): void;
}

/**
 * What can be done to one folder tab — the same list for the context menu of the strip and for the
 * selector that replaces it under `md`, so the two never offer different things (plan 06, S-110).
 *
 * Moving is by the menu **and** by the keyboard, never only by dragging: dragging alone is not
 * accessible (docs/architecture/web/03-ui-system.md#abas-de-pasta).
 */
export function tabActionsOf(
  tab: FolderTab,
  control: Pick<FolderTabs, 'tabs' | 'askClose' | 'move'>,
  copyPath: (path: string) => void,
): readonly TabAction[] {
  const paths = control.tabs.map((each) => each.path);
  const at = paths.indexOf(tab.path);
  const kept = control.tabs.filter((each) => each.kept).map((each) => each.path);
  const place = kept.indexOf(tab.path);
  const others = paths.filter((path) => path !== tab.path);
  const right = paths.slice(at + 1);

  return [
    {
      id: 'close',
      labelKey: 'workbench.tabAction.close',
      icon: X,
      disabled: false,
      run: () => {
        control.askClose([tab.path]);
      },
    },
    {
      id: 'closeOthers',
      labelKey: 'workbench.tabAction.closeOthers',
      icon: XSquare,
      disabled: others.length === 0,
      run: () => {
        control.askClose(others);
      },
    },
    {
      id: 'closeRight',
      labelKey: 'workbench.tabAction.closeRight',
      icon: XSquare,
      disabled: right.length === 0,
      run: () => {
        control.askClose(right);
      },
    },
    {
      id: 'moveLeft',
      labelKey: 'workbench.tabAction.moveLeft',
      icon: ArrowLeft,
      disabled: place <= 0,
      run: () => {
        control.move(tab.path, -1);
      },
    },
    {
      id: 'moveRight',
      labelKey: 'workbench.tabAction.moveRight',
      icon: ArrowRight,
      disabled: place === -1 || place === kept.length - 1,
      run: () => {
        control.move(tab.path, 1);
      },
    },
    {
      id: 'copyPath',
      labelKey: 'workbench.tabAction.copyPath',
      icon: Copy,
      disabled: false,
      run: () => {
        copyPath(tab.path);
      },
    },
  ];
}

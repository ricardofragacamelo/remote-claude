import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import { afterClose, useShortcut } from '@/features/commands';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from '@/shared/components/ui/context-menu';
import type { ActionGroup, ExplorerAction } from '../hooks/explorer-actions';
import type { Explorer } from '../hooks/useExplorer';

export interface ExplorerContextMenuProps {
  readonly explorer: Explorer;
  readonly actions: readonly ExplorerAction[];
}

/** The groups of the menu, in order — separated, as the editor people know has them. */
const GROUPS: readonly ActionGroup[] = ['new', 'open', 'transfer', 'edit', 'path', 'claude'];

/**
 * The context menu of the tree — the right click, a long press, `Shift+F10` or the menu key on a row:
 * every action on what is selected, with the key that does the same (S-180). An action that cannot
 * act now is disabled; "Add to Claude's context" is not there at all while nobody takes files
 * (S-276).
 */
export function ExplorerContextMenu({
  explorer,
  actions,
}: ExplorerContextMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const groups = GROUPS.map((group) =>
    actions.filter(
      (action) => action.group === group && (group !== 'claude' || explorer.claudeTakesFiles),
    ),
  ).filter((items) => items.length > 0);

  return (
    <ContextMenuContent aria-label={t('explorer.menu.label')}>
      {groups.map((items, index) => (
        <Fragment key={items[0]?.id}>
          {index > 0 && <ContextMenuSeparator />}
          {items.map((action) => (
            <MenuItem key={action.id} action={action} />
          ))}
        </Fragment>
      ))}
    </ContextMenuContent>
  );
}

/** One item, with its shortcut as the registry has it. */
function MenuItem({ action }: { readonly action: ExplorerAction }): React.JSX.Element {
  const { t } = useTranslation();
  const shortcut = useShortcut(action.id);

  return (
    <ContextMenuItem
      disabled={!action.available()}
      aria-keyshortcuts={shortcut?.aria}
      onSelect={() => {
        afterClose(action.run);
      }}
    >
      <action.icon className="size-4" aria-hidden />
      {t(action.labelKey)}
      {shortcut !== null && <ContextMenuShortcut>{shortcut.label}</ContextMenuShortcut>}
    </ContextMenuItem>
  );
}

import { ContextMenuActionItems } from '@/shared/components/ContextMenuActionItems';
import { ContextMenuContent } from '@/shared/components/ui/context-menu';
import type { SelectionBarAction } from '@/shared/components/SelectionActionBar';

export interface RowActionsMenuProps {
  /** Already translated. */
  readonly ariaLabel: string;
  readonly actions: readonly SelectionBarAction[];
}

/**
 * One row's own context menu, from the same action list its table's toolbar and the palette use —
 * `mcp`'s own `McpServerTable` and an engine extension's own `PluginTable`/`SkillTable` (plan 13,
 * B-28, B-29, B-34) all build the same `ContextMenuContent` around `ContextMenuActionItems`.
 */
export function RowActionsMenu({ ariaLabel, actions }: RowActionsMenuProps): React.JSX.Element {
  return (
    <ContextMenuContent aria-label={ariaLabel}>
      <ContextMenuActionItems
        actions={actions.map((action) => ({ ...action, disabled: !action.available() }))}
      />
    </ContextMenuContent>
  );
}

import type { ReactNode } from 'react';

import { RowActionsMenu } from '@/shared/components/RowActionsMenu';
import type { SelectionBarAction } from '@/shared/components/SelectionActionBar';
import { ContextMenu, ContextMenuTrigger } from '@/shared/components/ui/context-menu';

export interface SelectableTableRowProps {
  /** Already translated — the row's own context menu accessible name. */
  readonly ariaLabel: string;
  readonly actions: readonly SelectionBarAction[];
  onDoubleClick?(): void;

  /** Overrides the row's own classes — a double-clickable row wants a `cursor-default`, say. */
  readonly className?: string;

  /** The row's own `<td>`s. */
  readonly children: ReactNode;
}

const DEFAULT_ROW_CLASS = 'border-b border-border last:border-b-0 hover:bg-accent/50';

/**
 * One row of a dense, selectable table, with its own context menu — `mcp`'s own `McpServerTable` and
 * an engine extension's own `PluginTable`/`SkillTable` (plan 13, B-28, B-29, B-34) all wrap their
 * cells the same way: a `ContextMenu` around the row, opened by a right click, offering the same
 * actions the toolbar and the palette do.
 */
export function SelectableTableRow({
  ariaLabel,
  actions,
  onDoubleClick,
  className,
  children,
}: SelectableTableRowProps): React.JSX.Element {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <tr className={className ?? DEFAULT_ROW_CLASS} onDoubleClick={onDoubleClick}>
          {children}
        </tr>
      </ContextMenuTrigger>
      <RowActionsMenu ariaLabel={ariaLabel} actions={actions} />
    </ContextMenu>
  );
}

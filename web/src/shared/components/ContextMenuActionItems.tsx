import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';

import { ContextMenuItem } from '@/shared/components/ui/context-menu';

/** One item a context menu offers — a label, an icon, whether it can run now. */
export interface ContextMenuAction {
  readonly id: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  readonly disabled: boolean;
  run(): void;
}

/**
 * The items of a context menu, from a plain list of actions — the same rendering the folder tabs
 * (`FolderTabStrip`) and the MCP server table (`McpServerTable`) both need: an icon, a translated
 * label, disabled when the action cannot run now.
 */
export function ContextMenuActionItems({
  actions,
}: {
  readonly actions: readonly ContextMenuAction[];
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      {actions.map((action) => (
        <ContextMenuItem key={action.id} disabled={action.disabled} onSelect={action.run}>
          <action.icon className="size-4" aria-hidden />
          {t(action.labelKey)}
        </ContextMenuItem>
      ))}
    </>
  );
}

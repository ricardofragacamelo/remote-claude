import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';

/** One bulk action the selection bar offers — the toolbar's own slice of a screen's action list. */
export interface SelectionBarAction {
  readonly id: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  available(): boolean;
  run(): void;
}

/**
 * The i18n keys of a selection bar, translated by {@link SelectionActionBar} itself — a caller
 * declares this as a plain module-level constant, never inline in JSX (see `RemoveConfirmDialog`'s
 * own doc for why).
 */
export interface SelectionBarKeys {
  /** `{{count}}` — the accessible name of the toolbar itself. */
  readonly ariaLabel: string;

  /** `{{count}}` — the visible count, beside the actions. */
  readonly count: string;
}

export interface SelectionActionBarProps {
  readonly count: number;
  readonly keys: SelectionBarKeys;
  readonly actions: readonly SelectionBarAction[];
}

/**
 * The bar of bulk actions a selection of rows gets — shown only while something is selected, a
 * count and a button per action, each disabled on its own when it cannot run (plan 13, B-28, B-29,
 * S-134). Shared by `mcp`'s own `McpToolbar` and an engine extension's own `PluginToolbar`.
 */
export function SelectionActionBar({
  count,
  keys,
  actions,
}: SelectionActionBarProps): React.JSX.Element | null {
  const { t } = useTranslation();

  if (count === 0) {
    return null;
  }

  return (
    <div
      role="toolbar"
      aria-label={t(keys.ariaLabel, { count })}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
    >
      <span className="text-ui-sm">{t(keys.count, { count })}</span>
      {actions.map((action) => (
        <Button
          key={action.id}
          variant="outline"
          disabled={!action.available()}
          onClick={action.run}
          title={t(action.labelKey)}
        >
          <action.icon className="size-4" aria-hidden />
          {t(action.labelKey)}
        </Button>
      ))}
    </div>
  );
}

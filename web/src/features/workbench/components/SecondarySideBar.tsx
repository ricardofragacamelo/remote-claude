import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface SecondarySideBarProps {
  /** What the host puts beside the editor: the chat with Claude, for the folder of the tab. */
  readonly children: ReactNode;
}

/**
 * The chat with Claude, beside the editor — **never** a screen or a route of its own: the files and
 * the conversation about them are in the same folder tab, at the same time
 * (docs/architecture/web/03-ui-system.md#anatomia-do-workbench).
 */
export function SecondarySideBar({ children }: SecondarySideBarProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <aside
      aria-label={t('workbench.claude.label')}
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <h2 className="flex h-header shrink-0 items-center px-3 text-ui-sm font-ui-strong tracking-wide uppercase">
        {t('workbench.claude.label')}
      </h2>
      {/* No scroll here: the child is given a height and scrolls what is its own (plan 09, B-04). */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}

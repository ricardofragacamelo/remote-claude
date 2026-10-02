import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/components/ui/context-menu';
import type { PanelTabs } from '../../hooks/usePanelTabs';
import type { PanelTab } from '../../store/claude-panel.store';

/**
 * What a tab of the panel offers on its context menu (plan 08, B-32): moving it a place either way,
 * and closing it — which never ends its session (S-150).
 */
export function PanelTabMenu({
  tab,
  tabs,
  children,
}: {
  readonly tab: PanelTab;
  readonly tabs: PanelTabs;

  /** The tab itself — what the menu opens on. */
  readonly children: ReactElement;
}): React.JSX.Element {
  const { t } = useTranslation();
  const actions = [
    {
      id: 'left',
      icon: ChevronLeft,
      label: t('sessions.tabs.moveLeft'),
      run: () => tabs.move(tab.key, -1),
    },
    {
      id: 'right',
      icon: ChevronRight,
      label: t('sessions.tabs.moveRight'),
      run: () => tabs.move(tab.key, 1),
    },
    { id: 'close', icon: X, label: t('sessions.tabs.close'), run: () => tabs.close(tab.key) },
  ];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map((action) => (
          <ContextMenuItem key={action.id} onSelect={action.run}>
            <action.icon className="size-4" aria-hidden />
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

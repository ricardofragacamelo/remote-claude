import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AlertTriangle, Folder, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { cn } from '@/shared/lib/utils';
import type { FolderTabs } from '../hooks/useFolderTabs';
import { folderTabBadges } from '../store/registries';
import { tabActionsOf } from '../hooks/useTabActions';
import type { FolderTab } from '../types/workbench';

export interface FolderTabStripProps {
  readonly control: FolderTabs;
  copyPath(path: string): void;
}

/**
 * The folder tabs, side by side, from `md` up.
 *
 * Each tab is a whole workbench of one folder. It is reordered by dragging, **and** from the keyboard
 * (`Alt+Shift+←/→` on a tab) and from its menu — dragging alone is not accessible (plan 06, S-106).
 * Its menu closes it, the others, or the ones to its right, and copies its path.
 */
export function FolderTabStrip({ control, copyPath }: FolderTabStripProps): React.JSX.Element {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState<string | null>(null);

  return (
    <nav aria-label={t('workbench.tabs.label')} className="flex min-w-0 flex-1">
      <ul className="flex min-w-0 overflow-x-auto">
        {control.tabs.map((tab, index) => (
          <FolderTabItem
            key={tab.path}
            tab={tab}
            active={tab.path === control.active}
            control={control}
            copyPath={copyPath}
            onDragStart={() => {
              setDragging(tab.path);
            }}
            onDrop={() => {
              if (dragging !== null) {
                control.moveTo(dragging, index);
              }
              setDragging(null);
            }}
          />
        ))}
      </ul>
    </nav>
  );
}

interface FolderTabItemProps {
  readonly tab: FolderTab;
  readonly active: boolean;
  readonly control: FolderTabs;
  copyPath(path: string): void;
  onDragStart(): void;
  onDrop(): void;
}

/** `Alt+Shift+←/→` moves the tab the keyboard is on. */
function moveBy(event: KeyboardEvent<HTMLElement>): -1 | 1 | null {
  if (!event.altKey || !event.shiftKey) {
    return null;
  }

  return event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : null;
}

function FolderTabItem({
  tab,
  active,
  control,
  copyPath,
  onDragStart,
  onDrop,
}: FolderTabItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const unavailable = tab.state !== 'available';
  const Icon = unavailable ? AlertTriangle : Folder;

  return (
    <li
      className={cn(
        'flex shrink-0 items-center border-r border-t-2 border-border border-t-transparent',
        active && 'border-t-primary bg-tab-active',
      )}
    >
      <ContextMenu>
        <Tooltip>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>
              <button
                type="button"
                draggable
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-header max-w-56 items-center gap-1.5 pr-1 pl-3 text-ui',
                  active ? 'text-foreground' : 'text-muted-foreground',
                  !tab.kept && 'italic',
                )}
                onClick={() => {
                  control.activate(tab.path);
                }}
                onKeyDown={(event) => {
                  const by = moveBy(event);
                  if (by !== null) {
                    event.preventDefault();
                    control.move(tab.path, by);
                  }
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', tab.path);
                  onDragStart();
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onDrop();
                }}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{tab.name}</span>
                <TabBadges folder={tab.path} />
                {unavailable && (
                  <span className="sr-only">{t(`workbench.tabState.${tab.state}`)}</span>
                )}
              </button>
            </TooltipTrigger>
          </ContextMenuTrigger>
          <TooltipContent className="flex-col items-start">
            <span className="font-code">{tab.path}</span>
            {unavailable && <span>{t(`workbench.tabState.${tab.state}`)}</span>}
            {!tab.kept && <span>{t('workbench.tabs.notKept')}</span>}
          </TooltipContent>
        </Tooltip>
        <ContextMenuContent>
          {tabActionsOf(tab, control, copyPath).map((action) => (
            <ContextMenuItem key={action.id} disabled={action.disabled} onSelect={action.run}>
              <action.icon className="size-4" aria-hidden />
              {t(action.labelKey)}
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      <IconButton
        icon={X}
        label={t('workbench.tabs.close', { name: tab.name })}
        className="mr-1"
        onClick={() => {
          control.askClose([tab.path]);
        }}
      />
    </li>
  );
}

/** What the features say on a folder tab — a question of Claude waiting there, for one. */
function TabBadges({ folder }: { readonly folder: string }): React.JSX.Element {
  const badges = useRegistry(folderTabBadges);

  return (
    <>
      {badges.map((entry) => (
        <entry.component key={entry.id} folder={folder} />
      ))}
    </>
  );
}

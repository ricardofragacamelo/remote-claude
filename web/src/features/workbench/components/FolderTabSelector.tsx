import { ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import type { FolderTabs } from '../hooks/useFolderTabs';
import { tabActionsOf } from '../hooks/useTabActions';

export interface FolderTabSelectorProps {
  readonly control: FolderTabs;
  copyPath(path: string): void;
}

/**
 * Under `md`, the folder tabs as a selector at the top — the same tabs and **the same actions** as
 * the strip, in a menu that fits 360 px (plan 06, S-110).
 */
export function FolderTabSelector({
  control,
  copyPath,
}: FolderTabSelectorProps): React.JSX.Element {
  const { t } = useTranslation();
  const current = control.current;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('workbench.tabs.pick', { name: current.name })}
          className="flex min-h-touch min-w-0 flex-1 items-center justify-between gap-2 px-3 text-ui"
        >
          <span className="truncate">{current.name}</span>
          <ChevronsUpDown className="size-4 shrink-0" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-sm">
        <DropdownMenuLabel>{t('workbench.tabs.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={control.active}
          onValueChange={(path) => {
            control.activate(path);
          }}
        >
          {control.tabs.map((tab) => (
            <DropdownMenuRadioItem key={tab.path} value={tab.path}>
              <span className="truncate">{tab.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          {t('workbench.tabs.actionsOf', { name: current.name })}
        </DropdownMenuLabel>
        {tabActionsOf(current, control, copyPath).map((action) => (
          <DropdownMenuItem key={action.id} disabled={action.disabled} onSelect={action.run}>
            <action.icon className="size-4" aria-hidden />
            {t(action.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

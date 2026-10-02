import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';

/** One thing a row offers: what it is called, and what it does. */
export interface RowAction {
  readonly id: string;

  /** A translation key, named in full where the action is declared. */
  readonly labelKey: string;
  run(): void;
}

/** An action of a row, declared on one line: its id, its key, what it does. */
export function rowAction(id: string, labelKey: string, run: () => void): RowAction {
  return { id, labelKey, run };
}

/**
 * The actions of a row, twice: on a right click over the row, and behind its "…" button — the same
 * list, so neither can offer what the other does not (S-47).
 */
export function RowActions({
  actions,
  children,
}: {
  readonly actions: readonly RowAction[];
  readonly children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group flex items-stretch gap-1">
          {children}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger
                  aria-label={t('sessions.row.actions')}
                  className="inline-flex size-touch shrink-0 items-center justify-center rounded-md hover:bg-accent md:size-7"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t('sessions.row.actions')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {actions.map((action) => (
                <DropdownMenuItem key={action.id} onSelect={action.run}>
                  {t(action.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map((action) => (
          <ContextMenuItem key={action.id} onSelect={action.run}>
            {t(action.labelKey)}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

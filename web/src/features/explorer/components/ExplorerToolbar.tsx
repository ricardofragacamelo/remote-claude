import { Ellipsis } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { SORT_KEYS } from '../hooks/explorer-actions';
import type { ExplorerAction } from '../hooks/explorer-actions';
import type { Explorer } from '../hooks/useExplorer';
import { SORT_ORDERS } from '../types/explorer';
import type { SortOrder } from '../types/explorer';

export interface ExplorerToolbarProps {
  readonly explorer: Explorer;
  readonly actions: readonly ExplorerAction[];
}

/** The buttons of the toolbar, by command — the same label and the same act as the palette's. */
const BUTTONS = [
  'explorer.newFile',
  'explorer.newFolder',
  'explorer.newFromTemplate',
  'explorer.uploadFiles',
  'explorer.uploadFolder',
  'explorer.refresh',
  'explorer.collapseAll',
] as const;

/** The view's options in the "more" menu, by command. */
const OPTIONS = ['explorer.toggleHidden', 'explorer.toggleCompact'] as const;

/**
 * The toolbar of the Explorer: new file, new folder, new from template, reload, collapse all — each
 * an icon with its translated name as tooltip and `aria-label` (S-199) —, the options of the view
 * (the order, hidden entries, compacted folders), the help, and the filter by name (S-165).
 */
export function ExplorerToolbar({ explorer, actions }: ExplorerToolbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const filterField = useRef<HTMLInputElement>(null);
  const filterRequest = explorer.state.filterRequest;

  // "Filter" from the palette or its key puts the keyboard in the field.
  useEffect(() => {
    if (filterRequest > 0) {
      filterField.current?.focus();
    }
  }, [filterRequest]);

  const among = (ids: readonly string[]): ExplorerAction[] =>
    ids.flatMap((id) => actions.filter((each) => each.id === id));

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-border px-2 pb-2">
      <div
        role="toolbar"
        aria-label={t('explorer.toolbar.label')}
        className="flex items-center gap-0.5"
      >
        {among(BUTTONS).map((action) => (
          <IconButton
            key={action.id}
            icon={action.icon}
            label={t(action.labelKey)}
            onClick={action.run}
          />
        ))}
        <ViewOptions explorer={explorer} options={among(OPTIONS)} />
        {among(['explorer.showHelp']).map((help) => (
          <IconButton
            key={help.id}
            icon={help.icon}
            label={t(help.labelKey)}
            className="ml-auto"
            onClick={help.run}
          />
        ))}
      </div>
      <input
        ref={filterField}
        type="search"
        value={explorer.state.filter}
        aria-label={t('explorer.filter.label')}
        placeholder={t('explorer.filter.placeholder')}
        className="h-7 min-h-touch w-full rounded-md border border-border bg-background px-2 text-ui md:min-h-0"
        onChange={(event) => {
          explorer.state.setFilter(event.target.value);
        }}
      />
    </div>
  );
}

/** "More": the order of the tree and the options of what it shows. */
function ViewOptions({
  explorer,
  options,
}: {
  readonly explorer: Explorer;
  readonly options: readonly ExplorerAction[];
}): React.JSX.Element {
  const { t } = useTranslation();
  const label = t('explorer.toolbar.options');

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={label}
              className="inline-flex size-touch items-center justify-center rounded-md hover:bg-accent md:size-7"
            >
              <Ellipsis className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('explorer.toolbar.sort')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={explorer.state.sort}
          // The only values are the items below, one per order.
          onValueChange={(value) => {
            explorer.state.setSort(value as SortOrder);
          }}
        >
          {SORT_ORDERS.map((order) => (
            <DropdownMenuRadioItem key={order} value={order}>
              {t(SORT_KEYS[order])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuItem key={option.id} onSelect={option.run}>
            <option.icon className="size-4" aria-hidden />
            {t(option.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

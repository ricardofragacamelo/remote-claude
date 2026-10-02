import { useId } from 'react';
import type { CSSProperties, DragEvent, MouseEvent } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { ENTRY_ICONS, iconNameOf } from '../lib/file-icons';
import type { EntryRow } from '../lib/tree-rows';
import { InlineNameField } from './InlineNameField';
import type { InlineNameFieldProps } from './InlineNameField';

/** How far one level is indented, in pixels. */
const INDENT = 12;

export interface TreeItemProps {
  readonly row: EntryRow;
  readonly selected: boolean;
  readonly focused: boolean;

  /** Being cut: shown dimmed until it is pasted. */
  readonly cut: boolean;
  readonly dropTarget: boolean;
  readonly style: CSSProperties;

  /** The field to show in place of the name, while the entry is renamed. */
  readonly naming: Omit<InlineNameFieldProps, 'initialName' | 'kind'> | null;
  onClick(event: MouseEvent): void;
  onDoubleClick(): void;
  onContextMenu(): void;
  onDragStart(event: DragEvent): void;
  onDragOver(event: DragEvent): void;
  onDragLeave(): void;
  onDrop(event: DragEvent): void;
}

/** Why an entry cannot be acted on, as words — the tooltip and what a screen reader hears. */
function whyInert(row: EntryRow): string | null {
  if (row.entry.unreadableName) {
    return 'explorer.tree.unreadableName';
  }

  return row.entry.outside ? 'explorer.tree.outsideLink' : null;
}

function rowClass(selected: boolean, dropTarget: boolean, dimmed: boolean): string {
  return cn(
    'absolute right-0 left-0 flex cursor-default items-center gap-1 pr-2 text-ui outline-none select-none',
    'hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
    selected && 'bg-accent text-accent-foreground',
    dropTarget && 'ring-1 ring-primary ring-inset',
    dimmed && 'opacity-60',
  );
}

/**
 * One entry of the tree: a `treeitem` with its level and its place among its siblings — kept by the
 * virtualized window, which draws only what is on screen (S-161). The tab stop moves with the
 * keyboard (`tabIndex` 0 on one row only). A link out of the folder has its own icon and does not
 * open; a name that is not text is shown and inert, and both say why (B-25).
 */
export function TreeItem({
  row,
  selected,
  focused,
  cut,
  dropTarget,
  style,
  naming,
  ...handlers
}: TreeItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = ENTRY_ICONS[iconNameOf(row.entry, row.expanded)];
  const Chevron = row.expanded ? ChevronDown : ChevronRight;
  const inert = whyInert(row);
  const reasonId = useId();

  return (
    <div
      role="treeitem"
      data-key={row.key}
      aria-label={row.names.join('/')}
      aria-level={row.level}
      aria-setsize={row.setSize}
      aria-posinset={row.posInSet}
      aria-expanded={row.expandable ? row.expanded : undefined}
      aria-selected={selected}
      aria-describedby={inert === null ? undefined : reasonId}
      tabIndex={focused ? 0 : -1}
      draggable={naming === null}
      style={style}
      className={rowClass(selected, dropTarget, cut || inert !== null)}
      {...handlers}
    >
      <span aria-hidden style={{ width: (row.level - 1) * INDENT }} className="shrink-0" />
      <Chevron
        className={cn('size-3.5 shrink-0 text-muted-foreground', !row.expandable && 'invisible')}
        aria-hidden
      />
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <EntryName row={row} naming={naming} />
      {inert !== null && <InertMark reason={t(inert)} id={reasonId} outside={row.entry.outside} />}
    </div>
  );
}

/** The mark of an entry that cannot be acted on, with the reason for the mouse and the reader. */
function InertMark({
  reason,
  id,
  outside,
}: {
  readonly reason: string;
  readonly id: string;
  readonly outside: boolean;
}): React.JSX.Element {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-auto inline-flex shrink-0 text-muted-foreground">
            {outside ? (
              <ExternalLink className="size-3.5" aria-hidden />
            ) : (
              <FileQuestion className="size-3.5" aria-hidden />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
      <span id={id} className="sr-only">
        {reason}
      </span>
    </>
  );
}

/** The name on the row — or, while it is renamed, the field it is typed in. */
function EntryName({ row, naming }: Pick<TreeItemProps, 'row' | 'naming'>): React.JSX.Element {
  if (naming === null) {
    return <span className="min-w-0 truncate">{row.names.join('/')}</span>;
  }

  return (
    <InlineNameField
      {...naming}
      kind={row.expandable ? 'directory' : 'file'}
      initialName={row.entry.name}
    />
  );
}

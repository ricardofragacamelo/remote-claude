import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { outlineMove, outlineRows } from '../../lib/pdf-outline';
import type { OutlineRow } from '../../lib/pdf-outline';
import type { PdfOutlineItem } from '../../types/pdf';

export interface PdfOutlineProps {
  readonly items: readonly PdfOutlineItem[];
  readonly name: string;

  /** Goes to where an entry leads. */
  open(item: PdfOutlineItem): void;
}

/** One entry of the tree: its chevron, when it has entries under it, and its title. */
function Entry({
  row,
  focused,
  focus,
}: {
  readonly row: OutlineRow;
  readonly focused: boolean;
  focus(): void;
}): React.JSX.Element {
  const Chevron = row.expanded ? ChevronDown : ChevronRight;

  return (
    <div
      role="treeitem"
      aria-level={row.level}
      aria-posinset={row.position}
      aria-setsize={row.siblings}
      aria-expanded={row.expandable ? row.expanded : undefined}
      aria-selected={focused}
      data-key={row.key}
      tabIndex={focused ? 0 : -1}
      onFocus={focus}
      className={cn(
        'flex min-h-row cursor-pointer items-start gap-1 rounded-sm py-0.5 pr-2 text-ui-sm',
        'hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
        focused && 'bg-accent/60',
      )}
      style={{ paddingLeft: `${String((row.level - 1) * 12 + 4)}px` }}
    >
      {row.expandable ? (
        <span data-chevron className="mt-0.5 shrink-0">
          <Chevron className="size-4" aria-hidden />
        </span>
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 break-words">{row.item.title}</span>
    </div>
  );
}

/**
 * The outline of a PDF as a tree (21 · B-12): `role="tree"`, its first level showing, walked with the
 * keyboard of the WAI-ARIA pattern — up and down, right and left to open and close, Home, End, and
 * Enter to go (S-33). One entry is the tab stop; the arrows move it.
 */
export function PdfOutline({ items, name, open }: PdfOutlineProps): React.JSX.Element {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(() => outlineRows(items, expanded), [items, expanded]);
  const [focused, setFocused] = useState('0');
  const tree = useRef<HTMLDivElement>(null);
  // Moved by the keyboard: the entry takes the focus once it is drawn.
  const [moved, setMoved] = useState(false);
  // The entry with the focus was closed away: its first visible one takes the stop.
  const stop = rows.some((row) => row.key === focused) ? focused : '0';

  useEffect(() => {
    if (moved) {
      tree.current?.querySelector<HTMLElement>(`[data-key="${stop}"]`)?.focus();
    }
  }, [moved, stop]);

  const toggle = (key: string, on: boolean): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const move = outlineMove(rows, stop, event.key);
    if (move === null) return;
    event.preventDefault();
    if ('focus' in move) {
      setFocused(move.focus);
      setMoved(true);
    } else if ('expand' in move) {
      toggle(move.expand, true);
    } else if ('collapse' in move) {
      toggle(move.collapse, false);
    } else {
      open(move.open.item);
    }
  };

  // A click on an entry goes where it leads; on its chevron, it opens or closes it.
  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target as Element;
    const row = rows.find(
      (each) => each.key === target.closest<HTMLElement>('[data-key]')?.dataset['key'],
    );
    if (row === undefined) return;
    setFocused(row.key);
    if (target.closest('[data-chevron]') !== null) toggle(row.key, !row.expanded);
    else open(row.item);
  };

  return (
    <div
      ref={tree}
      role="tree"
      // The tree itself is reached through its entries: one of them is the tab stop.
      tabIndex={-1}
      aria-label={t('editor.pdf.outlineTree', { name })}
      onKeyDown={onKeyDown}
      onClick={onClick}
      className="flex flex-col p-1"
    >
      {rows.map((row) => (
        <Entry
          key={row.key}
          row={row}
          focused={row.key === stop}
          focus={() => {
            setFocused(row.key);
          }}
        />
      ))}
    </div>
  );
}

import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { useKeyContext } from '@/features/commands';
import { ContextMenu, ContextMenuTrigger } from '@/shared/components/ui/context-menu';
import type { ExplorerAction } from '../hooks/explorer-actions';
import type { Explorer } from '../hooks/useExplorer';
import { useFollowFocus } from '../hooks/useFollowFocus';
import { useTreeKeyboard } from '../hooks/useTreeKeyboard';
import { useTreePointer } from '../hooks/useTreePointer';
import type { TreePointer } from '../hooks/useTreePointer';
import { useRowHeight, useVirtualRows } from '../hooks/useVirtualRows';
import { indexOfKey } from '../lib/tree-navigation';
import { explorerStore } from '../store/explorer.store';
import type { EntryRow, NoteRow, TreeRow } from '../lib/tree-rows';
import { ExplorerContextMenu } from './ExplorerContextMenu';
import { InlineNameField } from './InlineNameField';
import { FailedLevelItem, NoteItem } from './NoteItem';
import { TreeItem } from './TreeItem';

export interface ExplorerTreeProps {
  readonly explorer: Explorer;
  readonly actions: readonly ExplorerAction[];
}

/** How far one level is indented past the chevron, in pixels — the rows that are not entries. */
const NOTE_INDENT = 18;

/** Makes the Explorer's shortcuts live — rendered only while the focus is in the tree. */
function ExplorerKeys(): null {
  useKeyContext('explorer');
  return null;
}

/** A row that took the focus — a click, a Tab — is where the keyboard is from now on. */
function keyboardOn(folder: string, target: EventTarget): void {
  const key = target instanceof HTMLElement ? target.dataset['key'] : undefined;
  const store = explorerStore(folder).getState();

  if (key !== undefined && store.focused !== key) {
    store.setFocused(key);
  }
}

/** A row to draw, and where it is in the whole list. */
interface Drawn {
  readonly row: TreeRow;
  readonly index: number;
}

/** The rows to draw: the window, and the row of the tab stop wherever it is. */
function drawnRows(
  rows: readonly TreeRow[],
  start: number,
  end: number,
  tabStop: number,
): readonly Drawn[] {
  const at = (from: number) => (row: TreeRow, offset: number) => ({ row, index: from + offset });
  const window = rows.slice(start, end).map(at(start));
  const outside = tabStop !== -1 && (tabStop < start || tabStop >= end);
  const stop = outside ? rows.slice(tabStop, tabStop + 1).map(at(tabStop)) : [];

  return [...window, ...stop].sort((left, right) => left.index - right.index);
}

/**
 * The tree of the open folder: an ARIA tree, flat and virtualized — only the rows on screen are
 * drawn, each with its level and its place among its siblings (S-161) — walked with the keyboard of
 * the pattern (S-162), with a selection of many (S-181) and a context menu (S-180).
 *
 * Dragging moves entries into a folder, and carries them to Claude's chat too (D-20); "Move to…" is
 * the same without a mouse (S-175).
 */
export function ExplorerTree({ explorer, actions }: ExplorerTreeProps): React.JSX.Element {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const treeElement = useRef<HTMLDivElement>(null);
  const rowHeight = useRowHeight();
  const rows = explorer.tree.rows;
  const view = useVirtualRows(rows.length, rowHeight, scroller);
  const [inside, setInside] = useState(false);
  const goTo = useFollowFocus(explorer.folder, rows, treeElement);
  const onKeyDown = useTreeKeyboard(explorer.folder, explorer.tree, goTo);
  const pointer = useTreePointer(explorer);
  const focusedIndex = indexOfKey(rows, explorer.state.focused);
  const tabStop =
    focusedIndex === -1 ? rows.findIndex((row) => row.type === 'entry') : focusedIndex;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={scroller}
          className="relative min-h-0 flex-1 overflow-y-auto"
          onScroll={view.onScroll}
          {...pointer.dropOn('')}
        >
          {inside && <ExplorerKeys />}
          <div
            ref={treeElement}
            role="tree"
            tabIndex={-1}
            aria-label={t('explorer.tree.label')}
            aria-multiselectable
            className="relative outline-none"
            style={{ height: rows.length * rowHeight }}
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              setInside(true);
              keyboardOn(explorer.folder, event.target);
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setInside(false);
              }
            }}
          >
            {drawnRows(rows, view.start, view.end, tabStop).map(({ row, index }) => (
              <Row
                key={row.key}
                row={row}
                explorer={explorer}
                pointer={pointer}
                focused={index === tabStop}
                style={{ top: index * rowHeight, height: rowHeight }}
              />
            ))}
          </div>
        </div>
      </ContextMenuTrigger>
      <ExplorerContextMenu explorer={explorer} actions={actions} />
    </ContextMenu>
  );
}

interface RowProps {
  readonly row: TreeRow;
  readonly explorer: Explorer;
  readonly pointer: TreePointer;
  readonly focused: boolean;
  readonly style: CSSProperties;
}

/** One row, whatever it is: an entry, a name being typed, or a note about a level. */
function Row({ row, explorer, pointer, focused, style }: RowProps): React.JSX.Element {
  if (row.type === 'entry') {
    return (
      <EntryItem row={row} explorer={explorer} pointer={pointer} focused={focused} style={style} />
    );
  }

  if (row.type === 'creating') {
    return <CreatingItem row={row} explorer={explorer} style={style} />;
  }

  if (row.type === 'error') {
    return (
      <FailedLevelItem
        row={row}
        focused={focused}
        style={style}
        onRetry={() => {
          explorer.tree.retry(row.parent);
        }}
      />
    );
  }

  return <NoteItem row={row} style={style} />;
}

/** The row of a new entry, named in place at the top of its folder (S-168). */
function CreatingItem({
  row,
  explorer,
  style,
}: {
  readonly row: Extract<NoteRow, { readonly type: 'creating' }>;
  readonly explorer: Explorer;
  readonly style: CSSProperties;
}): React.JSX.Element {
  const { t } = useTranslation();
  const kind = row.kind;

  return (
    <div
      role="treeitem"
      aria-level={row.level}
      aria-selected={false}
      className="absolute right-0 left-0 flex items-center pr-2"
      style={{ ...style, paddingLeft: (row.level - 1) * 12 + NOTE_INDENT }}
    >
      <InlineNameField
        kind={kind}
        initialName={explorer.state.creating?.initialName ?? ''}
        label={t(kind === 'directory' ? 'explorer.name.newFolder' : 'explorer.name.newFile')}
        {...explorer.name}
      />
    </div>
  );
}

/** The row of an entry, with what the pointer does on it. */
function EntryItem({
  row,
  explorer,
  pointer,
  focused,
  style,
}: Omit<RowProps, 'row'> & { readonly row: EntryRow }): React.JSX.Element {
  const { t } = useTranslation();
  const { state } = explorer;
  const destination = row.expandable ? row.path : row.parent;
  const clipboard = state.clipboard;

  return (
    <TreeItem
      row={row}
      selected={state.selection.includes(row.path)}
      focused={focused}
      cut={clipboard?.mode === 'cut' && clipboard.paths.includes(row.path)}
      dropTarget={row.expandable && pointer.dropTarget === row.path}
      style={style}
      naming={
        row.renaming
          ? { label: t('explorer.name.rename', { name: row.entry.name }), ...explorer.name }
          : null
      }
      onClick={(event) => {
        pointer.click(row, event);
      }}
      onDoubleClick={() => {
        explorer.open(row);
      }}
      onContextMenu={() => {
        pointer.pointAt(row);
      }}
      onDragStart={(event) => {
        pointer.dragStart(row, event);
      }}
      {...pointer.dropOn(destination)}
    />
  );
}

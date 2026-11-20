import { useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, FileSearch, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { ContextMenu, ContextMenuTrigger } from '@/shared/components/ui/context-menu';
import { useRowHeight, useVirtualRows } from '@/shared/hooks/useVirtualRows';
import { cn } from '@/shared/lib/utils';
import type { SearchView } from '../hooks/useSearchView';
import type { ReplaceView } from '../hooks/useReplaceView';
import type { SearchMatch } from '../types/search';
import type { SearchRow } from '../lib/search-rows';
import { HighlightedText } from './HighlightedText';
import { SearchContextMenu } from './SearchContextMenu';

/** A row to draw, with its place among its own siblings — a file among files, a match among a file's own. */
interface Drawn<M extends SearchMatch> {
  readonly row: SearchRow<M>;
  readonly index: number;
  readonly setSize: number;
  readonly posInSet: number;
}

/** `rows`, each told its place among its own siblings — a file's matches reset the count. */
function placedRows<M extends SearchMatch>(rows: readonly SearchRow<M>[]): readonly Drawn<M>[] {
  const fileCount = rows.filter((row) => row.kind === 'file').length;
  let fileIndex = 0;
  let matchIndex = 0;
  let matchCountOfFile = 0;

  return rows.map((row, index) => {
    if (row.kind === 'file') {
      fileIndex += 1;
      matchIndex = 0;
      matchCountOfFile = row.matchCount;
      return { row, index, setSize: fileCount, posInSet: fileIndex };
    }

    matchIndex += 1;
    return { row, index, setSize: matchCountOfFile, posInSet: matchIndex };
  });
}

export interface SearchResultsTreeProps {
  readonly view: SearchView;
  readonly replace: ReplaceView;

  /** Asks before replacing one file — the dirty files warn, "replace all" shows its scope first. */
  onReplaceFile(path: string): void;
}

/**
 * The results, as an ARIA tree, flat and virtualized — thousands of matches scroll without
 * slowing the screen down (S-117). A file row toggles its own matches; a match row opens the
 * editor at its line and column, the matched text selected (S-116). With the replace row open
 * (B-16), the tree is the preview's own instead, and a file row's own click opens its diff (S-125)
 * — collapsing it is the chevron's own, smaller target then, the same as a key always did.
 */
export function SearchResultsTree({
  view,
  replace,
  onReplaceFile,
}: SearchResultsTreeProps): React.JSX.Element {
  const { t } = useTranslation();
  const replacing = replace.replaceOpen;
  const rows = replacing ? replace.rows : view.rows;
  const rowHeight = useRowHeight();
  const scroller = useRef<HTMLDivElement>(null);
  const treeElement = useRef<HTMLDivElement>(null);
  const virtual = useVirtualRows(rows.length, rowHeight, scroller);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [contextTarget, setContextTarget] = useState<SearchRow<SearchMatch> | null>(null);

  const focusedIndex = rows.findIndex((row) => row.key === focusedKey);
  const tabStop = focusedIndex === -1 ? 0 : focusedIndex;
  const placed = placedRows(rows).filter(
    (drawn) =>
      drawn.index === tabStop || (drawn.index >= virtual.start && drawn.index < virtual.end),
  );

  const activate = (row: SearchRow<SearchMatch>): void => {
    if (row.kind === 'file') {
      if (replacing) {
        replace.openDiff(row.path);
      } else {
        view.toggleCollapsed(row.path);
      }
    } else {
      view.open(row.path, row.match, false);
    }
  };

  /** `ArrowRight` expands a collapsed file, `ArrowLeft` collapses an expanded one — nothing else. */
  const collapseOrExpand = (row: SearchRow<SearchMatch> | undefined, key: string): void => {
    if (row?.kind === 'file' && row.collapsed === (key === 'ArrowRight')) {
      view.toggleCollapsed(row.path);
    }
  };

  /** What one key press does, at the row the keyboard is on — `null` for a key this tree ignores. */
  const actionFor = (key: string, at: number): (() => void) | null => {
    if (key === 'ArrowDown') {
      return () => {
        setFocusedKey(rows[Math.min(rows.length - 1, at + 1)]?.key ?? null);
      };
    }
    if (key === 'ArrowUp') {
      return () => {
        setFocusedKey(rows[Math.max(0, at - 1)]?.key ?? null);
      };
    }
    if (key === 'Enter') {
      return () => {
        const row = rows[at];
        if (row !== undefined) {
          activate(row);
        }
      };
    }
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      return () => {
        collapseOrExpand(rows[at], key);
      };
    }
    return null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const at = rows.findIndex((row) => row.key === (focusedKey ?? rows[0]?.key));
    const action = at === -1 ? null : actionFor(event.key, at);

    if (action !== null) {
      event.preventDefault();
      action();
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
          <div
            ref={treeElement}
            role="tree"
            tabIndex={-1}
            aria-label={t('search.view.resultsLabel')}
            className="relative outline-none"
            style={{ height: rows.length * rowHeight }}
            onKeyDown={onKeyDown}
          >
            {placed.map(({ row, index, setSize, posInSet }) => (
              <SearchResultRow
                key={row.key}
                row={row}
                replacing={replacing}
                focused={index === tabStop}
                setSize={setSize}
                posInSet={posInSet}
                style={{
                  position: 'absolute',
                  top: index * rowHeight,
                  left: 0,
                  right: 0,
                  height: rowHeight,
                }}
                onFocus={() => {
                  setFocusedKey(row.key);
                }}
                onActivate={() => {
                  activate(row);
                }}
                onToggleCollapsed={() => {
                  view.toggleCollapsed(row.path);
                }}
                onContextMenu={() => {
                  setContextTarget(row);
                }}
                onSearchAgain={() => {
                  view.searchAgain();
                }}
              />
            ))}
          </div>
        </div>
      </ContextMenuTrigger>
      <SearchContextMenu
        view={view}
        replace={replace}
        target={contextTarget}
        onReplaceFile={onReplaceFile}
      />
    </ContextMenu>
  );
}

interface SearchResultRowProps {
  readonly row: SearchRow<SearchMatch>;
  readonly replacing: boolean;
  readonly focused: boolean;
  readonly setSize: number;
  readonly posInSet: number;
  readonly style: CSSProperties;
  onFocus(): void;
  onActivate(): void;
  onToggleCollapsed(): void;
  onContextMenu(): void;
  onSearchAgain(): void;
}

/** The `treeitem` shape every row shares — only what is inside, and its ARIA level/label, differ. */
function TreeItemRow({
  rowKey,
  label,
  level,
  setSize,
  posInSet,
  expanded,
  focused,
  style,
  onFocus,
  onActivate,
  onContextMenu,
  children,
}: {
  readonly rowKey: string;
  readonly label: string;
  readonly level: number;
  readonly setSize: number;
  readonly posInSet: number;

  /** Present only for a row that can collapse — a file, never a match. */
  readonly expanded?: boolean;
  readonly focused: boolean;
  readonly style: CSSProperties;
  onFocus(): void;
  onActivate(): void;
  onContextMenu(): void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the tree root's own onKeyDown handles every key a row needs (WAI-ARIA tree pattern delegates to the container)
    <div
      role="treeitem"
      data-key={rowKey}
      aria-label={label}
      aria-level={level}
      aria-setsize={setSize}
      aria-posinset={posInSet}
      aria-expanded={expanded}
      aria-selected={false}
      tabIndex={focused ? 0 : -1}
      style={style}
      className={cn(
        'absolute right-0 left-0 flex cursor-default items-center gap-1 px-2 text-ui outline-none select-none',
        'hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
      )}
      onFocus={onFocus}
      onClick={onActivate}
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  );
}

function SearchResultRow({
  row,
  replacing,
  focused,
  setSize,
  posInSet,
  style,
  onFocus,
  onActivate,
  onToggleCollapsed,
  onContextMenu,
  onSearchAgain,
}: SearchResultRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const shared = { focused, setSize, posInSet, style, onFocus, onActivate, onContextMenu };

  if (row.kind === 'file') {
    const Chevron = row.collapsed ? ChevronRight : ChevronDown;

    return (
      <TreeItemRow
        rowKey={row.key}
        label={row.path}
        level={1}
        expanded={!row.collapsed}
        {...shared}
      >
        {replacing ? (
          <IconButton
            icon={Chevron}
            label={t(
              row.collapsed ? 'search.view.actionExpandAll' : 'search.view.actionCollapseAll',
            )}
            className="size-5 shrink-0"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapsed();
            }}
          />
        ) : (
          <Chevron className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <FileSearch className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate font-code text-ui-sm">{row.path}</span>
        <span className="ml-1 shrink-0 text-ui-sm text-muted-foreground">{row.matchCount}</span>
        {row.stale && (
          <button
            type="button"
            className="ml-auto flex shrink-0 items-center gap-1 text-ui-sm text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onSearchAgain();
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {t('search.view.staleSearchAgain')}
          </button>
        )}
      </TreeItemRow>
    );
  }

  return (
    <TreeItemRow
      rowKey={row.key}
      label={t('search.view.resultsMatchLabel', { line: row.match.line })}
      level={2}
      {...shared}
    >
      <span aria-hidden style={{ width: 18 }} className="shrink-0" />
      <span className="shrink-0 text-ui-sm text-muted-foreground">{row.match.line}</span>
      <span className="truncate font-code text-ui-sm">
        <HighlightedText
          text={row.match.preview}
          positions={Array.from(
            { length: row.match.previewMatchEnd - row.match.previewMatchStart },
            (_, offset) => row.match.previewMatchStart + offset,
          )}
          {...(replacing && 'replacement' in row.match
            ? { replacement: row.match.replacement as string }
            : {})}
        />
      </span>
    </TreeItemRow>
  );
}

import {
  ChevronsDownUp,
  ChevronsUpDown,
  Clipboard,
  ClipboardCopy,
  Columns2,
  FileSearch,
  GitCompare,
  Replace,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/shared/components/ui/context-menu';
import { useCopy } from '@/shared/hooks/useCopy';
import type { ReplaceView } from '../hooks/useReplaceView';
import type { SearchView } from '../hooks/useSearchView';
import type { SearchRow } from '../lib/search-rows';
import type { SearchMatch } from '../types/search';

export interface SearchContextMenuProps {
  readonly view: SearchView;
  readonly replace: ReplaceView;

  /** The row the context menu was opened on — `null` for the tree with nothing under the pointer. */
  readonly target: SearchRow<SearchMatch> | null;

  /** Asks before replacing one file — the same the toolbar's "Replace all" asks before its own. */
  onReplaceFile(path: string): void;
}

/**
 * The context menu of the results tree (plan 11, B-15, S-118): open, open beside and copy the
 * matched text for one match; dismiss and copy the path for either a match or a whole file;
 * collapse and expand everything, always on offer. With the replace row open (B-16), a match or a
 * file both replace the same file (S-128), and a file also opens its own diff (S-125).
 */
export function SearchContextMenu({
  view,
  replace,
  target,
  onReplaceFile,
}: SearchContextMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useCopy();
  const isMatch = target?.kind === 'match';
  const replacing = replace.replaceOpen;

  return (
    <ContextMenuContent aria-label={t('search.view.menuLabel')}>
      {isMatch && target.kind === 'match' && (
        <>
          <ContextMenuItem
            onSelect={() => {
              view.open(target.path, target.match, false);
            }}
          >
            <FileSearch className="size-4" aria-hidden />
            {t('search.view.actionOpen')}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              view.open(target.path, target.match, true);
            }}
          >
            <Columns2 className="size-4" aria-hidden />
            {t('search.view.actionOpenBeside')}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              copy.copy(target.match.preview);
            }}
          >
            <ClipboardCopy className="size-4" aria-hidden />
            {t('search.view.actionCopyResult')}
          </ContextMenuItem>
          {replacing && (
            <ContextMenuItem
              onSelect={() => {
                onReplaceFile(target.path);
              }}
            >
              <Replace className="size-4" aria-hidden />
              {t('search.view.actionReplaceMatch')}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
        </>
      )}
      {target?.kind === 'file' && replacing && (
        <>
          <ContextMenuItem
            onSelect={() => {
              replace.openDiff(target.path);
            }}
          >
            <GitCompare className="size-4" aria-hidden />
            {t('search.view.actionOpenDiff')}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              onReplaceFile(target.path);
            }}
          >
            <Replace className="size-4" aria-hidden />
            {t('search.view.actionReplaceFile')}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {target !== null && (
        <>
          <ContextMenuItem
            onSelect={() => {
              copy.copy(target.path);
            }}
          >
            <Clipboard className="size-4" aria-hidden />
            {t('search.view.actionCopyPath')}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              if (target.kind === 'file') {
                view.dismissFile(target.path);
              } else {
                view.dismissMatch(target.path, target.match.line, target.match.column);
              }
            }}
          >
            <X className="size-4" aria-hidden />
            {t('search.view.actionDismiss')}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem
        onSelect={() => {
          copy.copy(replacing ? replace.copyAllText() : view.copyAllText());
        }}
      >
        <ClipboardCopy className="size-4" aria-hidden />
        {t('search.view.actionCopyAll')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={replacing ? replace.collapseAll : view.collapseAll}>
        <ChevronsDownUp className="size-4" aria-hidden />
        {t('search.view.actionCollapseAll')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={view.expandAll}>
        <ChevronsUpDown className="size-4" aria-hidden />
        {t('search.view.actionExpandAll')}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

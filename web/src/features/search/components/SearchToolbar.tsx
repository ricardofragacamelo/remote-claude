import {
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleHelp,
  ClipboardCopy,
  EyeOff,
  FileOutput,
  FolderOpen,
  History,
  Regex,
  ReplaceAll,
  WholeWord,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { executeCommand, useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { IconButton } from '@/shared/components/IconButton';
import { useCopy } from '@/shared/hooks/useCopy';
import { useHistoryNav } from '../hooks/useHistoryNav';
import { openResultsEditor } from '../lib/open-results-editor';
import { stepResult } from '../lib/result-navigation';
import { searchViewStore } from '../store/search-view.store';
import type { SearchMatch } from '../types/search';
import type { SearchRow } from '../lib/search-rows';
import type { SearchView } from '../hooks/useSearchView';
import type { ReplaceView } from '../hooks/useReplaceView';

export interface SearchToolbarProps {
  readonly view: SearchView;
  readonly replace: ReplaceView;

  /** Shows the scope, or the dirty files, before `replace.replaceAll` runs (S-124). */
  onReplaceAll(): void;
}

/** One text field of the toolbar — the query, "to include", "to exclude" — all the same shape. */
function FilterField({
  type,
  value,
  label,
  placeholder,
  invalid,
  focusOnMount,
  onChange,
  onKeyDown,
}: {
  readonly type: 'search' | 'text';
  readonly value: string;
  readonly label: string;
  readonly placeholder: string;
  readonly invalid?: boolean;

  /** The query field's own, opening the view (S-146) — never the filters, which would steal it. */
  readonly focusOnMount?: boolean;
  onChange(value: string): void;
  onKeyDown?(event: KeyboardEvent<HTMLInputElement>): void;
}): React.JSX.Element {
  return (
    <input
      type={type}
      value={value}
      aria-label={label}
      aria-invalid={invalid}
      placeholder={placeholder}
      // eslint-disable-next-line jsx-a11y/no-autofocus -- only the query field asks for it, opening the view itself (S-146)
      autoFocus={focusOnMount}
      className="h-7 min-h-touch w-full rounded-md border border-border bg-background px-2 text-ui md:min-h-0"
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onKeyDown={onKeyDown}
    />
  );
}

/** One `Aa`/`ab`/`.*`-style toggle of the toolbar — a flag, pressed or not. */
function FlagToggle({
  icon,
  label,
  pressed,
  onToggle,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly pressed: boolean;
  onToggle(): void;
}): React.JSX.Element {
  return <IconButton icon={icon} label={label} aria-pressed={pressed} onClick={onToggle} />;
}

/**
 * The search field, its three toggles, the include/exclude filters, and what acts on the whole
 * tree — collapse, expand, copy all (plan 11, B-15). A regex refusal shows beside the field,
 * without losing what was found before (S-114).
 */
export function SearchToolbar({
  view,
  replace,
  onReplaceAll,
}: SearchToolbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useCopy();
  // The active error is the replace preview's own while that row is open — the search request
  // underneath is suppressed then (D-06), so `view.error` would never carry a regex refusal.
  const activeError = replace.replaceOpen ? replace.error : view.error;
  const patternError = activeError?.code === 'SEARCH_PATTERN_INVALID' ? activeError : null;
  const historyNav = useHistoryNav(view.folder, view.query, view.setQuery);
  // The rows `F4`/`Shift+F4` step through are whichever tree is on screen (B-19) — the same choice
  // `SearchResultsTree` makes for what it draws.
  const rows: readonly SearchRow<SearchMatch>[] = replace.replaceOpen ? replace.rows : view.rows;

  const stepToResult = (direction: 1 | -1): void => {
    const store = searchViewStore(view.folder);
    const next = stepResult(rows, store.getState().activeResultKey, direction);
    if (next !== null) {
      store.getState().setActiveResultKey(next.key);
      view.open(next.path, next.match, false);
    }
  };

  const declarations: readonly CommandDeclaration[] = [
    {
      id: 'search.openResultsEditor',
      labelKey: 'command.search.openResultsEditor',
      category: 'file',
      icon: FileOutput,
      when: () => view.resultCount > 0,
      run: () => openResultsEditor(view.folder, view, view.rows),
    },
    {
      id: 'search.clearHistory',
      labelKey: 'command.search.clearHistory',
      category: 'file',
      icon: History,
      run: () => {
        searchViewStore(view.folder).getState().clearHistory();
      },
    },
    {
      id: 'search.nextResult',
      labelKey: 'command.search.nextResult',
      category: 'go',
      icon: ArrowDown,
      when: () => rows.some((row) => row.kind === 'match'),
      run: () => {
        stepToResult(1);
      },
      keys: [{ key: 'F4', context: 'global' }],
    },
    {
      id: 'search.previousResult',
      labelKey: 'command.search.previousResult',
      category: 'go',
      icon: ArrowUp,
      when: () => rows.some((row) => row.kind === 'match'),
      run: () => {
        stepToResult(-1);
      },
      keys: [{ key: 'Shift+F4', context: 'global' }],
    },
  ];
  useCommands(declarations);

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-2 pb-2">
      <div className="flex items-center gap-1">
        <IconButton
          icon={replace.replaceOpen ? ChevronDown : ChevronRight}
          label={t('search.view.replaceToggle')}
          aria-expanded={replace.replaceOpen}
          onClick={() => {
            replace.setReplaceOpen(!replace.replaceOpen);
          }}
        />
        <FilterField
          type="search"
          value={view.query}
          label={t('search.view.queryLabel')}
          placeholder={t('search.view.queryPlaceholder')}
          invalid={patternError !== null}
          focusOnMount
          onChange={view.setQuery}
          onKeyDown={historyNav.onKeyDown}
        />
        <FlagToggle
          icon={CaseSensitive}
          label={t('search.view.flagCaseSensitive')}
          pressed={view.caseSensitive}
          onToggle={() => {
            view.setCaseSensitive(!view.caseSensitive);
          }}
        />
        <FlagToggle
          icon={WholeWord}
          label={t('search.view.flagWholeWord')}
          pressed={view.wholeWord}
          onToggle={() => {
            view.setWholeWord(!view.wholeWord);
          }}
        />
        <FlagToggle
          icon={Regex}
          label={t('search.view.flagIsRegex')}
          pressed={view.isRegex}
          onToggle={() => {
            view.setIsRegex(!view.isRegex);
          }}
        />
      </div>
      {patternError !== null && (
        <p role="alert" className="text-ui-sm text-destructive">
          {t(patternError.messageKey, patternError.params)}
        </p>
      )}
      {replace.replaceOpen && (
        <div className="flex items-center gap-1 pl-8">
          <FilterField
            type="text"
            value={replace.replacement}
            label={t('search.view.replaceLabel')}
            placeholder={t('search.view.replacePlaceholder')}
            onChange={replace.setReplacement}
          />
          <FlagToggle
            icon={CaseSensitive}
            label={t('search.view.flagPreserveCase')}
            pressed={replace.preserveCase}
            onToggle={() => {
              replace.setPreserveCase(!replace.preserveCase);
            }}
          />
          <IconButton
            icon={ReplaceAll}
            label={t('search.view.actionReplaceAll')}
            disabled={replace.fileCount === 0 || replace.isApplying}
            onClick={onReplaceAll}
          />
        </div>
      )}
      <div className="flex items-center gap-1">
        <FilterField
          type="text"
          value={view.include}
          label={t('search.view.includeLabel')}
          placeholder={t('search.view.includePlaceholder')}
          onChange={view.setInclude}
        />
        <FilterField
          type="text"
          value={view.exclude}
          label={t('search.view.excludeLabel')}
          placeholder={t('search.view.excludePlaceholder')}
          onChange={view.setExclude}
        />
        <FlagToggle
          icon={EyeOff}
          label={t('search.view.flagUseIgnoreFiles')}
          pressed={view.useIgnoreFiles}
          onToggle={() => {
            view.setUseIgnoreFiles(!view.useIgnoreFiles);
          }}
        />
        <FlagToggle
          icon={FolderOpen}
          label={t('search.view.flagOnlyOpenEditors')}
          pressed={view.onlyOpenEditors}
          onToggle={() => {
            view.setOnlyOpenEditors(!view.onlyOpenEditors);
          }}
        />
      </div>
      <div
        role="toolbar"
        aria-label={t('search.view.toolbarLabel')}
        className="flex items-center gap-0.5"
      >
        <span className="text-ui-sm text-muted-foreground">
          {t('search.view.resultsCount', { files: view.fileCount, matches: view.resultCount })}
        </span>
        <IconButton
          icon={ChevronsDownUp}
          label={t('search.view.actionCollapseAll')}
          className="ml-auto"
          onClick={view.collapseAll}
        />
        <IconButton
          icon={ChevronsUpDown}
          label={t('search.view.actionExpandAll')}
          onClick={view.expandAll}
        />
        <IconButton
          icon={ClipboardCopy}
          label={t('search.view.actionCopyAll')}
          onClick={() => {
            copy.copy(view.copyAllText());
          }}
        />
        <IconButton
          icon={FileOutput}
          label={t('search.view.actionOpenInEditor')}
          disabled={view.resultCount === 0}
          onClick={() => {
            void executeCommand('search.openResultsEditor', t);
          }}
        />
        <IconButton
          icon={CircleHelp}
          label={t('help.panel.open')}
          aria-expanded={view.helpOpen}
          onClick={() => {
            view.setHelpOpen(!view.helpOpen);
          }}
        />
      </div>
    </div>
  );
}

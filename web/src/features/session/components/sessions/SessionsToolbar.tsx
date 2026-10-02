import { CircleHelp, FolderTree, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import type { SessionsView } from '../../hooks/useSessionsView';
import type { OriginFilter, SessionSort } from '../../types/sessions-view';

const ORIGINS: readonly OriginFilter[] = ['all', 'ours', 'external'];
const SORTS: readonly SessionSort[] = ['recent', 'name'];

/**
 * Search, filter and order of the view, and its three buttons — refresh, the folders below, help.
 * Every control says what it does by name, to a screen reader as much as to a tooltip (S-56).
 */
export function SessionsToolbar({ view }: { readonly view: SessionsView }): React.JSX.Element {
  const { t } = useTranslation();
  const { state } = view;
  const searchId = `sessions-search-${view.folder}`;

  return (
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center gap-1">
        <label htmlFor={searchId} className="sr-only">
          {t('sessions.view.search')}
        </label>
        <input
          id={searchId}
          type="search"
          value={state.search}
          placeholder={t('sessions.view.searchPlaceholder')}
          onChange={(event) => {
            state.setSearch(event.target.value);
          }}
          className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2 text-ui-sm"
        />
        <IconButton icon={RefreshCw} label={t('sessions.view.refresh')} onClick={view.refresh} />
        <IconButton
          icon={FolderTree}
          label={t(
            state.includeSubfolders ? 'sessions.view.subfoldersOn' : 'sessions.view.subfoldersOff',
          )}
          aria-pressed={state.includeSubfolders}
          onClick={() => {
            state.setIncludeSubfolders(!state.includeSubfolders);
          }}
        />
        <IconButton
          icon={CircleHelp}
          label={t('sessions.view.help')}
          onClick={() => {
            state.setHelpOpen(true);
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-ui-sm">
        <label className="flex items-center gap-1">
          <span>{t('sessions.view.origin')}</span>
          <select
            value={state.origin}
            onChange={(event) => {
              state.setOrigin(event.target.value as OriginFilter);
            }}
            className="h-7 rounded border border-input bg-background px-1"
          >
            {ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {t(`sessions.originOption.${origin}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span>{t('sessions.view.sort')}</span>
          <select
            value={state.sort}
            onChange={(event) => {
              state.setSort(event.target.value as SessionSort);
            }}
            className="h-7 rounded border border-input bg-background px-1"
          >
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sessions.sortOption.${sort}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

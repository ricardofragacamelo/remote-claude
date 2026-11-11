import { useCallback, useMemo, useState } from 'react';
import { AlarmClock, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useCommands } from '@/features/commands';
import { LoadMore } from '@/shared/components/LoadMore';
import { useClock } from '@/shared/hooks/useClock';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { useSelection } from '@/shared/hooks/useSelection';
import { EXPIRY_WARNING_MS, isExpiringSoon } from '../lib/listed-rule';
import type { RuleListViewProps } from '../lib/rule-list-view';
import type { RuleTab } from '../lib/rules-search';
import { ruleSummaryFilters, rulesListQuery } from '../lib/rules-search';
import type { RulesSearch } from '../lib/rules-search';
import { useRuleListNav } from '../hooks/useRuleListNav';
import { useRuleMutations } from '../hooks/useRuleMutations';
import { useRuleSummary } from '../hooks/useRuleSummary';
import { useRules } from '../hooks/useRules';
import type { PermissionRule, RuleSort } from '../types/rule';
import { DisabledRulesBanner } from './DisabledRulesBanner';
import { RuleBatchBar } from './RuleBatchBar';
import { RuleBatchRevokeDialog } from './RuleBatchRevokeDialog';
import { RuleCardList } from './RuleCardList';
import { RuleFiltersBar } from './RuleFiltersBar';
import type { RuleFiltersValue } from './RuleFiltersBar';
import { RuleTable } from './RuleTable';
import { RuleTabs } from './RuleTabs';

export interface RulesScreenProps {
  readonly search: RulesSearch;
  onSearch(next: RulesSearch): void;
  onOpenRule(ruleId: string): void;

  /** Opens the rule-authoring wizard, prefilled from a disabled rule's decision/scope/folder — never its pattern (S-225, B-27). */
  onRecreate(rule: {
    readonly decision: string;
    readonly scope: string;
    readonly folder: string | null;
  }): void;
}

/** The empty state's keys, per tab — literal, so the orphan check can see that each one is in use
 * (the same reason `LoadedList`'s `ListKeys` is always a literal object, never built from a tab
 * name at runtime). */
const EMPTY_KEYS: Readonly<
  Record<RuleTab, { readonly title: string; readonly description: string }>
> = {
  active: { title: 'rules.tabEmpty.activeTitle', description: 'rules.tabEmpty.activeDescription' },
  expiringSoon: {
    title: 'rules.tabEmpty.expiringSoonTitle',
    description: 'rules.tabEmpty.expiringSoonDescription',
  },
  expired: {
    title: 'rules.tabEmpty.expiredTitle',
    description: 'rules.tabEmpty.expiredDescription',
  },
  revoked: {
    title: 'rules.tabEmpty.revokedTitle',
    description: 'rules.tabEmpty.revokedDescription',
  },
  all: { title: 'rules.tabEmpty.allTitle', description: 'rules.tabEmpty.allDescription' },
};

/** Only the rules this build would still count for the tab shown — `expiringSoon` narrows `active` further, on the client, by the same seven-day window the badge and the detail use (D-13). */
function rowsOf(
  rules: readonly PermissionRule[],
  tab: RuleTab,
  withAlert: boolean | undefined,
  now: number,
): readonly PermissionRule[] {
  let rows = rules;

  if (tab === 'expiringSoon') {
    rows = rows.filter((rule) => isExpiringSoon(rule, now));
  }

  if (withAlert === true) {
    rows = rows.filter((rule) => (rule.findings?.length ?? 0) > 0);
  }

  return rows;
}

/**
 * `/rules`, in full (B-21): the tabs with their counts, the filters, the dense sortable table in its
 * four states, and the migration's disabled rules, when there are any. Everything that can be a link
 * is one — the search is the whole state (S-156).
 */
export function RulesScreen({
  search,
  onSearch,
  onOpenRule,
  onRecreate,
}: RulesScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const now = useClock(false);
  const query = useMemo(() => rulesListQuery(search), [search]);
  const {
    isLoading,
    error,
    rules,
    reload,
    hasMore,
    isLoadingMore,
    moreError,
    loadMore,
    removeRule,
  } = useRules(query);
  const expiresBefore = useMemo(() => new Date(now + EXPIRY_WARNING_MS).toISOString(), [now]);
  const summaryFilters = useMemo(
    () => ruleSummaryFilters(search, expiresBefore),
    [search, expiresBefore],
  );
  const summaryLoad = useRuleSummary(summaryFilters);
  const summary = summaryLoad.load.status === 'ready' ? summaryLoad.load.value : null;
  const { revoke, inFlight, failure } = useRuleMutations();
  const selection = useSelection();
  const isDesktop = useIsDesktop();
  const [batchRevokeOpen, setBatchRevokeOpen] = useState(false);

  const rows = useMemo(
    () => rowsOf(rules, search.tab, search.withAlert, now),
    [rules, search, now],
  );
  const expiringSoonIds = useMemo(
    () => new Set(rows.filter((rule) => isExpiringSoon(rule, now)).map((rule) => rule.id)),
    [rows, now],
  );
  const rowIds = useMemo(() => rows.map((rule) => rule.id), [rows]);
  const selectedRules = useMemo(
    () => rows.filter((rule) => selection.ids.has(rule.id)),
    [rows, selection.ids],
  );
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selection.ids.has(id));

  const onTab = useCallback(
    (tab: RuleTab) => {
      onSearch({ ...search, tab });
    },
    [search, onSearch],
  );

  const onFilters = useCallback(
    (next: RuleFiltersValue) => {
      // `next` is the filters' whole next state, not a patch: a field absent from it was cleared,
      // and `search`'s stale value for that same field must not survive the merge.
      onSearch({ tab: search.tab, sort: search.sort, order: search.order, ...next });
    },
    [search, onSearch],
  );

  const onSort = useCallback(
    (field: RuleSort) => {
      onSearch({
        ...search,
        sort: field,
        order: search.sort === field && search.order === 'desc' ? 'asc' : 'desc',
      });
    },
    [search, onSearch],
  );

  const onRevoke = useCallback(
    (ruleId: string) => {
      void revoke(ruleId)
        .then(() => {
          removeRule(ruleId);
        })
        .catch(() => {});
    },
    [revoke, removeRule],
  );

  const nav = useRuleListNav(rowIds, {
    onOpen: onOpenRule,
    onToggleSelected: selection.toggle,
    onRevoke,
  });

  // Shift-click range reads the row order at the moment of the click — the keyboard path above
  // (`nav`'s own) never carries a shift, so it keeps calling `selection.toggle` with nothing extra.
  const onToggleSelected = useCallback(
    (ruleId: string, shiftKey: boolean) => {
      selection.toggle(ruleId, { shiftKey, rowIds });
    },
    [selection, rowIds],
  );

  const onSelectAll = useCallback(() => {
    if (allSelected) {
      selection.clear();
    } else {
      selection.selectAll(rowIds);
    }
  }, [allSelected, selection, rowIds]);

  const onBatchRevoked = useCallback(
    (ruleIds: readonly string[]) => {
      for (const ruleId of ruleIds) {
        removeRule(ruleId);
      }
      selection.clear();
    },
    [removeRule, selection],
  );

  useCommands([
    {
      id: 'rules.revokeSelected',
      labelKey: 'rules.command.revokeSelected',
      category: 'view',
      icon: Undo2,
      when: () => selection.ids.size > 0,
      run: () => {
        setBatchRevokeOpen(true);
      },
      // Registered (and so bound) only while this screen is mounted, with something selected — the
      // same guard `when` already gives the palette entry (plan 15, B-26, S-184).
      keys: [{ key: 'Mod+K R', context: 'global' }],
    },
    {
      id: 'rules.openExpiringSoon',
      labelKey: 'rules.command.openExpiringSoon',
      category: 'go',
      icon: AlarmClock,
      run: () => {
        onTab('expiringSoon');
      },
      keys: [{ key: 'Mod+K E', context: 'global' }],
    },
  ]);

  const viewProps: RuleListViewProps = {
    rules: rows,
    isLoading,
    error,
    isEmpty: rows.length === 0,
    onRetry: reload,
    emptyTitleKey: EMPTY_KEYS[search.tab].title,
    emptyDescriptionKey: EMPTY_KEYS[search.tab].description,
    now,
    expiringSoon: expiringSoonIds,
    focusedId: nav.focusedId,
    onKeyDown: nav.onKeyDown,
    inFlight,
    failure,
  };

  return (
    <div className="flex flex-col gap-4">
      <DisabledRulesBanner count={summary?.byStatus.disabled ?? 0} onRecreate={onRecreate} />

      <RuleTabs tab={search.tab} onChange={onTab} summary={summary} />

      <RuleFiltersBar value={search} onChange={onFilters} rules={rules} />

      {isDesktop && selection.ids.size > 0 && (
        <RuleBatchBar
          count={selection.ids.size}
          onRevoke={() => {
            setBatchRevokeOpen(true);
          }}
          onClear={selection.clear}
        />
      )}

      {isDesktop ? (
        <RuleTable
          {...viewProps}
          sort={search.sort}
          order={search.order}
          onSort={onSort}
          selected={selection.ids}
          onToggleSelected={onToggleSelected}
          allSelected={allSelected}
          someSelected={selection.ids.size > 0}
          onSelectAll={onSelectAll}
          handlers={{ onOpen: onOpenRule, onRevoke }}
        />
      ) : (
        <RuleCardList {...viewProps} onOpen={onOpenRule} onRevoke={onRevoke} />
      )}

      {isDesktop && (
        <RuleBatchRevokeDialog
          rules={selectedRules}
          open={batchRevokeOpen}
          onOpenChange={setBatchRevokeOpen}
          onRevoked={onBatchRevoked}
          onOpenRule={onOpenRule}
        />
      )}

      <LoadMore
        hasMore={hasMore}
        isLoading={isLoadingMore}
        error={moreError}
        onLoadMore={loadMore}
        label={t('rules.table.loadMore')}
        loadingLabel={t('rules.table.loadingMore')}
      />
    </div>
  );
}

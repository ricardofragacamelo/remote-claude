import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { LoadedList } from '@/shared/components/LoadedList';
import type { ListKeys } from '@/shared/components/LoadedList';
import { auditFiltersKey, useAuditTrail } from '../hooks/useAuditTrail';
import type { AuditFilters } from '../types/audit';
import { AuditEntryRow } from './AuditEntryRow';
import { AuditFilterForm } from './AuditFilterForm';

/** Named as literals, so the orphan check can see that the catalogue entries are in use. */
const KEYS: ListKeys = {
  title: 'audit.list.title',
  description: 'audit.list.description',
  loading: 'audit.list.loading',
  emptyTitle: 'audit.list.emptyTitle',
  emptyDescription: 'audit.list.emptyDescription',
};

export interface AuditTrailProps {
  readonly filters: AuditFilters;

  /** Replaces the filters. They are the URL's, so this is a navigation, and it is the route's. */
  onFilter(next: AuditFilters): void;

  /** Opens a rule by id. Also the route's: the feature never learns the router exists. */
  onOpenRule(ruleId: string): void;
}

/**
 * "What ran on my machine without asking me?" — the trail, filtered and paged.
 *
 * The four states are the list's; what this adds is the way to more of it. "Load more" appends
 * the next page, and a failure there is shown beside the button while every entry already read
 * stays on screen (S-77).
 *
 * It imports hooks, and nothing else: no service, no `api.ts`.
 */
export function AuditTrail({ filters, onFilter, onOpenRule }: AuditTrailProps): React.JSX.Element {
  const { t } = useTranslation();
  const { isLoading, error, entries, hasMore, isLoadingMore, moreError, loadMore, reload } =
    useAuditTrail(filters);

  return (
    <div className="flex flex-col gap-4">
      {/* Keyed by the filters, so a URL that changed by itself is a fresh form, not a stale one. */}
      <AuditFilterForm key={auditFiltersKey(filters)} filters={filters} onApply={onFilter} />

      <LoadedList
        keys={KEYS}
        isLoading={isLoading}
        error={error}
        isEmpty={entries.length === 0}
        onRetry={reload}
      >
        {entries.map((entry) => (
          <AuditEntryRow
            key={entry.id}
            entry={entry}
            onOpenRule={onOpenRule}
            onShowSession={(sessionId) => {
              onFilter({ ...filters, sessionId });
            }}
          />
        ))}
      </LoadedList>

      {hasMore && (
        <Button variant="outline" size="touch" disabled={isLoadingMore} onClick={loadMore}>
          {isLoadingMore ? t('audit.list.loadingMore') : t('audit.list.loadMore')}
        </Button>
      )}

      {moreError !== null && (
        <p className="text-xs text-destructive" role="alert">
          {t(moreError.messageKey, moreError.params)}
        </p>
      )}
    </div>
  );
}

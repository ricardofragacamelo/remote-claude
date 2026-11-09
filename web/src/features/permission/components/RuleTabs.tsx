import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import type { RuleTab } from '../lib/rules-search';
import type { RuleSummary } from '../types/rule';

const TABS: readonly RuleTab[] = ['active', 'expiringSoon', 'expired', 'revoked', 'all'];

/** The count a tab shows, from the summary — `expiringSoon` is the client's own narrowing of `active`, so its count is the summary's `expiringBefore` (the server's count over the whole set, not only the page — plan 03, D-13). */
function countOf(tab: RuleTab, summary: RuleSummary | null): number | null {
  if (summary === null) return null;

  switch (tab) {
    case 'active':
      return summary.byStatus.active;
    case 'expiringSoon':
      return summary.expiringBefore;
    case 'expired':
      return summary.byStatus.expired;
    case 'revoked':
      return summary.byStatus.revoked;
    case 'all':
      return summary.byStatus.active + summary.byStatus.expired + summary.byStatus.revoked;
  }
}

export interface RuleTabsProps {
  readonly tab: RuleTab;
  onChange(tab: RuleTab): void;
  readonly summary: RuleSummary | null;
}

/**
 * Ativas · Perto de expirar · Expiradas · Revogadas · Todas — each with the summary's own count
 * (S-160). Hand-rolled rather than the shadcn `Tabs` primitive: there is one table below, filtered
 * by whichever tab is current, never five separate panels — the panel-per-tab wiring `Tabs` expects
 * (`aria-controls` to a `TabsContent` this screen has no second one of) does not fit this shape.
 */
export function RuleTabs({ tab, onChange, summary }: RuleTabsProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div role="tablist" aria-label={t('rules.tabs.label')} className="flex flex-wrap gap-1">
      {TABS.map((candidate) => {
        const count = countOf(candidate, summary);

        return (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={tab === candidate}
            className={cn(
              'flex min-h-touch items-center gap-1 rounded-md px-3 text-sm',
              tab === candidate ? 'bg-accent font-medium' : 'hover:bg-muted',
            )}
            onClick={() => {
              onChange(candidate);
            }}
          >
            {t(`rules.tabs.${candidate}`)}
            {count !== null && <span className="text-muted-foreground">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

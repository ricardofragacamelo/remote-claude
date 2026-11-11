import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/features/auth';
import { useClock } from '@/shared/hooks/useClock';
import { useRuleSummary } from '../hooks/useRuleSummary';
import { EXPIRY_WARNING_MS } from '../lib/listed-rule';
import { DEFAULT_RULES_SEARCH, ruleSummaryFilters } from '../lib/rules-search';

/**
 * How many active rules expire within seven days, on the "Regras" entry of the global navigation
 * (plan 15, B-25, S-178) — the same count the "Perto de expirar" tab shows (`RuleTabs`), read fresh
 * once when the navigation mounts, for the whole session: nothing here depends on which screen is
 * open, so a badge that depended on `/rules` being the active screen would go stale exactly when it
 * matters least. Zero, loading, or a failed read all show nothing — a badge is decorative, never an
 * error state of its own.
 *
 * The navigation rail renders before sign-in too (it is how "Workbench" leads to the sign-in
 * screen) — `Content` below only mounts, and so only reads the summary, once somebody is signed in.
 */
export function RulesNavBadge(): React.JSX.Element | null {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <Content /> : null;
}

function Content(): React.JSX.Element | null {
  const { t } = useTranslation();
  const now = useClock(false);
  const filters = useMemo(() => {
    const expiresBefore = new Date(now + EXPIRY_WARNING_MS).toISOString();
    return ruleSummaryFilters(DEFAULT_RULES_SEARCH, expiresBefore);
  }, [now]);
  const { load } = useRuleSummary(filters);
  const count = load.status === 'ready' ? load.value.expiringBefore : 0;

  if (count <= 0) {
    return null;
  }

  return (
    <span
      className="inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-ui-xs text-destructive-foreground"
      aria-label={t('navigation.rulesBadge.label', { count })}
    >
      {count}
    </span>
  );
}

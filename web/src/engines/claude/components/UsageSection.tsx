import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { IconButton } from '@/shared/components/IconButton';
import { LearnMore } from '@/shared/components/LearnMore';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { agoFrom } from '@/shared/lib/relative-time';
import { useRateLimits } from '../hooks/useRateLimits';
import { orderedByKind } from '../lib/rate-limit-labels';
import { RateLimitBar } from './RateLimitBar';

/**
 * "Uso": the account's rate-limit windows, as the CLI last reported them on the stream (plan 16,
 * D-09) — never real-time, and never per-user: the account is the machine's, shared by every
 * session. A fresh backend, or a machine where no session has run yet, shows no reading at all.
 */
export function UsageSection(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { windows, isLoading, error, retry } = useRateLimits();
  const ordered = orderedByKind(windows);
  const lastSeen = ordered.reduce<string | null>(
    (latest, window) =>
      latest === null || window.observedAt > latest ? window.observedAt : latest,
    null,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IconButton icon={RefreshCw} label={t('engines.claude.usage.refresh')} onClick={retry} />
        <LearnMore section="claude-usage" topic={t('engines.claude.usage.title')} />
      </div>
      <LoadStatus
        isLoading={isLoading}
        loadingLabel={t('engines.claude.usage.loading')}
        error={error}
        onRetry={retry}
        rows={3}
      />
      {!isLoading && error === null && ordered.length === 0 && (
        <EmptyState
          title={t('engines.claude.usage.noneTitle')}
          description={t('engines.claude.usage.noneBody')}
        />
      )}
      {ordered.length > 0 && (
        <div className="flex flex-col gap-4">
          {ordered.map((window) => (
            <RateLimitBar key={window.kind} window={window} />
          ))}
          {lastSeen !== null && (
            <p className="text-ui-xs text-muted-foreground">
              {t('engines.claude.usage.lastSeen', {
                when: agoFrom(lastSeen, new Date(), i18n.language),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

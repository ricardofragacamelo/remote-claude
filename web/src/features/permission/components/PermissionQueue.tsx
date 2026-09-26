import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { Panel } from '@/shared/components/Panel';
import { usePermissionQueue } from '../hooks/usePermissionQueue';
import { PermissionCard } from './PermissionCard';

export interface PermissionQueuePanelProps {
  readonly sessionId: string | null;

  /** Opens the rules screen — one of the two ways in to it that D-04 requires. */
  onOpenRules?: () => void;
}

/**
 * Everything the agent is waiting on, and how the last few were settled.
 *
 * The settled list is not bookkeeping: a request answered on a phone leaves this queue on its own,
 * and without a line saying who answered it the card would simply vanish — which reads as a bug.
 */
export function PermissionQueuePanel({
  sessionId,
  onOpenRules,
}: PermissionQueuePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const { pending, settled, remainingMs, answer, extend } = usePermissionQueue(sessionId);
  const last = settled.at(-1) ?? null;

  return (
    <Panel title={t('permission.queue.title')} description={t('permission.queue.description')}>
      {pending.length === 0 && (
        <EmptyState
          title={t('permission.queue.emptyTitle')}
          description={t('permission.queue.emptyDescription')}
        />
      )}

      {pending.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label={t('permission.queue.title')}>
          {pending.map((request) => (
            <PermissionCard
              key={request.requestId}
              request={request}
              remainingMs={remainingMs[request.requestId] ?? 0}
              onAnswer={answer}
              onExtend={extend}
              onOpenRules={onOpenRules}
            />
          ))}
        </ul>
      )}

      {last !== null && (
        <p className="text-xs opacity-70">
          {last.auto
            ? t('permission.queue.lastAuto', {
                decision: t(`permission.decision.${last.decision}`),
              })
            : t('permission.queue.lastBy', {
                decision: t(`permission.decision.${last.decision}`),
                who: last.resolvedBy ?? '',
              })}
        </p>
      )}
    </Panel>
  );
}

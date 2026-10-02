import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { Panel } from '@/shared/components/Panel';
import { usePermissionQueue } from '../hooks/usePermissionQueue';
import { PermissionCard } from './PermissionCard';
import { PlanApprovalCard } from './PlanApprovalCard';
import type { PlanMode } from './PlanApprovalCard';

export interface PermissionQueuePanelProps {
  readonly sessionId: string | null;

  /** Opens the rules screen — one of the two ways in to it that D-04 requires. */
  onOpenRules?: (() => void) | undefined;

  /** A plan was approved, to go on in this mode (plan 08, B-22). */
  onPlanApproved?: (mode: PlanMode) => void;

  /** The folder of the tab — what a pending edit is previewed against (plan 08, B-29). */
  readonly folder?: string | null;
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
  onPlanApproved,
  folder = null,
}: PermissionQueuePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const { pending, settled, remainingMs, answer, extend } = usePermissionQueue(sessionId);
  const last = settled.at(-1) ?? null;

  return (
    <Panel title={t('permission.queue.title')} description={t('permission.queue.description')}>
      <span id={`permission-queue-${sessionId ?? 'none'}`} />
      {pending.length === 0 && (
        <EmptyState
          title={t('permission.queue.emptyTitle')}
          description={t('permission.queue.emptyDescription')}
        />
      )}

      {pending.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label={t('permission.queue.title')}>
          {pending.map((request) => {
            const left = remainingMs[request.requestId] ?? 0;

            return request.toolName === 'ExitPlanMode' ? (
              <PlanApprovalCard
                key={request.requestId}
                request={request}
                remainingMs={left}
                onAnswer={answer}
                onApproved={onPlanApproved}
              />
            ) : (
              <PermissionCard
                key={request.requestId}
                request={request}
                remainingMs={left}
                onAnswer={answer}
                onExtend={extend}
                onOpenRules={onOpenRules}
                folder={folder}
              />
            );
          })}
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

import { PermissionCard } from './PermissionCard';
import type { PermissionCardProps } from './PermissionCard';
import { PlanApprovalCard } from './PlanApprovalCard';
import type { PlanMode } from './PlanApprovalCard';

export interface PermissionRequestCardProps extends PermissionCardProps {
  /** A plan was approved, to go on in this mode (plan 08, B-22). */
  onPlanApproved?: ((mode: PlanMode) => void) | undefined;
}

/**
 * One request waiting, whole: the plan to approve, or the tool to allow — the card of plan 03 and
 * plan 08 (B-22, B-29), unchanged. Where it stands is the conversation's: in the place of the tool it
 * asks about (plan 09, B-23, B-24).
 */
export function PermissionRequestCard({
  onPlanApproved,
  ...card
}: PermissionRequestCardProps): React.JSX.Element {
  return card.request.toolName === 'ExitPlanMode' ? (
    <PlanApprovalCard
      request={card.request}
      remainingMs={card.remainingMs}
      onAnswer={card.onAnswer}
      onApproved={onPlanApproved}
    />
  ) : (
    <PermissionCard {...card} />
  );
}

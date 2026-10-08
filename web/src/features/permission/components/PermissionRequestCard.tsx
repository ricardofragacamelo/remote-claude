import { PermissionCard } from './PermissionCard';
import type { PermissionCardProps } from './PermissionCard';
import { PlanApprovalCard } from './PlanApprovalCard';
import type { PlanMode } from './PlanApprovalCard';
import { QuestionCard } from './QuestionCard';
import type { QuestionCardProps } from './QuestionCard';
import type { QuestionDraft } from '../types/permission';

export interface PermissionRequestCardProps extends PermissionCardProps {
  /** A plan was approved, to go on in this mode (plan 08, B-22). */
  onPlanApproved?: ((mode: PlanMode) => void) | undefined;

  /** What answering a question of Claude takes — the drafts and the two answers (plan 24, B-14). */
  readonly question?: QuestionHandlers | undefined;
}

/** The drafts of the questions of a session, and how one is answered or refused. */
export interface QuestionHandlers extends Pick<
  QuestionCardProps,
  'onDraft' | 'onSubmit' | 'onDecline'
> {
  readonly drafts: Readonly<Record<string, QuestionDraft>>;
}

/**
 * One request waiting, whole: the plan to approve, or the tool to allow — the card of plan 03 and
 * plan 08 (B-22, B-29), unchanged. Where it stands is the conversation's: in the place of the tool it
 * asks about (plan 09, B-23, B-24).
 */
export function PermissionRequestCard({
  onPlanApproved,
  question,
  ...card
}: PermissionRequestCardProps): React.JSX.Element {
  const { interaction } = card.request;

  if (interaction !== null && question !== undefined) {
    return (
      <QuestionCard
        request={card.request}
        interaction={interaction}
        remainingMs={card.remainingMs}
        draft={question.drafts[card.request.requestId]}
        onDraft={question.onDraft}
        onSubmit={question.onSubmit}
        onDecline={question.onDecline}
        onExtend={card.onExtend}
      />
    );
  }

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

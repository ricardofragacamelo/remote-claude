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

  /** The modes the session's engine announces — what a plan can go on in (plan 28, B-27). */
  readonly planModes?: readonly PlanMode[] | null | undefined;

  /** What answering a question of the agent takes — the drafts and the two answers (plan 24, B-14). */
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
 * One request waiting, whole: the questions to answer, the plan to approve, or the tool to allow —
 * the card of plan 03 and plan 08 (B-22, B-29). Which one is by the `kind` of the request's
 * interaction, never by the tool (plan 28, B-20). Where it stands is the conversation's: in the place
 * of the tool it asks about (plan 09, B-23, B-24).
 */
export function PermissionRequestCard({
  onPlanApproved,
  planModes,
  question,
  ...card
}: PermissionRequestCardProps): React.JSX.Element {
  const { interaction } = card.request;

  if (interaction?.kind === 'question' && question !== undefined) {
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

  return interaction?.kind === 'plan' ? (
    <PlanApprovalCard
      request={card.request}
      plan={interaction}
      remainingMs={card.remainingMs}
      modes={planModes}
      onAnswer={card.onAnswer}
      onApproved={onPlanApproved}
    />
  ) : (
    <PermissionCard {...card} />
  );
}

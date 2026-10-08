import { useTranslation } from 'react-i18next';

import { PermissionRequestCard } from '@/features/permission';
import type { PermissionRequest } from '@/features/permission';
import type { InlineContext } from './timeline-context';

/**
 * A request, in the conversation (plan 09, B-23, B-24): the card of plan 03 — or the plan to approve
 * of plan 08 — whole, with nothing cut, standing where the line of its tool would be.
 */
export function InlinePermission({
  request,
  inline,
}: {
  readonly request: PermissionRequest;
  readonly inline: InlineContext;
}): React.JSX.Element {
  const { requests } = inline;

  return (
    <PermissionRequestCard
      request={request}
      remainingMs={requests.remainingMs[request.requestId] ?? 0}
      onAnswer={requests.answer}
      onExtend={requests.extend}
      onOpenRules={inline.onOpenRules}
      onPlanApproved={inline.onPlanApproved}
      folder={inline.folder}
      question={{
        drafts: requests.drafts,
        onDraft: requests.saveDraft,
        onSubmit: requests.answerQuestion,
        onDecline: requests.declineQuestion,
      }}
    />
  );
}

/**
 * The requests whose tool is not a line of the conversation (yet): asked before the line arrived —
 * the card goes to its place once it does, never drawn twice (S-59) —, or asked by a subagent, whose
 * lines are folded under its tool and would hide the card. At the end of the conversation, in view.
 */
export function TailRequests({
  inline,
  drawn,
}: {
  readonly inline: InlineContext;

  /** The tools that are lines of the main conversation. */
  readonly drawn: ReadonlySet<string>;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const waiting = inline.requests.pending.filter((request) => !drawn.has(request.toolUseId));

  return waiting.length === 0 ? null : (
    <ul className="flex flex-col gap-2" aria-label={t('sessions.inline.tail')}>
      {waiting.map((request) => (
        <InlinePermission key={request.requestId} request={request} inline={inline} />
      ))}
    </ul>
  );
}

import { MessageCircleQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface PendingPillProps {
  /** How many questions wait. */
  readonly count: number;

  /** The card of one of them is not in view. */
  readonly outOfView: boolean;

  /** Takes the person to the oldest. */
  onGoTo(): void;
}

/**
 * "Claude is waiting for your answer (n)", above the box, whenever a question's card is out of view —
 * scrolled away, or the changes on screen instead of the conversation (plan 09, B-25, R-02). Pressing
 * it brings the conversation back and takes the focus to the oldest question.
 *
 * It is how a question that arrives while somebody writes is said without taking their focus
 * ([D-13](../../../../../docs/plans/09-chat-layout/decisions.md#f4--inline)): the live region
 * announces it — and is there, empty, before anything is asked, so the first announcement is heard.
 */
export function PendingPill({ count, outOfView, onGoTo }: PendingPillProps): React.JSX.Element {
  const { t } = useTranslation();
  const label = t('sessions.pending.pill', { count });

  return (
    <>
      <span role="status" className="sr-only">
        {count > 0 ? label : ''}
      </span>
      {count > 0 && outOfView && (
        <button
          type="button"
          onClick={onGoTo}
          className="flex items-center gap-1.5 self-center rounded-full border border-primary bg-background px-3 py-1 text-ui-xs text-primary shadow-sm hover:bg-accent"
        >
          <MessageCircleQuestion className="size-3.5" aria-hidden />
          {label}
        </button>
      )}
    </>
  );
}

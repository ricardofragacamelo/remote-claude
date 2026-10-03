import { GitFork, PencilLine, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import type { StreamMessage } from '../../types/live-session';
import type { PromptActions } from './timeline-context';

/**
 * What can be done from a prompt of the conversation (plan 09, B-27): edit it and send it again,
 * fork from before it — both plan 08's (B-35) — and put the files back to before its turn
 * ([D-15](../../../../../docs/plans/09-chat-layout/decisions.md#f4--inline)). On screen when the
 * pointer is over the message or the focus is in it — always, where a finger is the pointer.
 *
 * With a turn running the undo is there, refused, saying why in its name and its tooltip — a
 * disabled button says nothing on hover. A session that ended has no undo, and no button for it.
 */
export function MessageActions({
  message,
  actions,
}: {
  readonly message: StreamMessage;
  readonly actions: PromptActions;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { onEdit, onFork, onUndo, undoBlocked = null } = actions;

  return (
    <div
      role="group"
      aria-label={t('sessions.message.actions')}
      className="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
    >
      {onEdit !== undefined && (
        <IconButton
          icon={PencilLine}
          label={t('sessions.message.edit')}
          onClick={() => {
            onEdit(message);
          }}
        />
      )}
      {onFork !== undefined && (
        <IconButton
          icon={GitFork}
          label={t('sessions.message.forkFrom')}
          onClick={() => {
            onFork(message);
          }}
        />
      )}
      {onUndo !== undefined && (
        <IconButton
          icon={Undo2}
          label={undoBlocked ?? t('sessions.message.undo')}
          aria-disabled={undoBlocked !== null}
          className={undoBlocked === null ? undefined : 'opacity-50'}
          onClick={() => {
            if (undoBlocked === null) onUndo(message);
          }}
        />
      )}
    </div>
  );
}

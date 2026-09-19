import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import type { StreamMessage, ToolExecution } from '../types/live-session';
import { ToolCard } from './ToolCard';

export interface ConversationProps {
  readonly messages: readonly StreamMessage[];
  readonly tools: readonly ToolExecution[];

  /** What is on screen is only what the replay buffer still held. */
  readonly isPartial: boolean;
}

/**
 * The conversation, and the tools it ran.
 *
 * The **partial** label is not a nicety. A session opened after it ended shows whatever the ring
 * buffer still has, and without saying so an absence of content reads as an absence of activity —
 * which is worse than showing nothing at all
 * ([D-10](../../../../../docs/plans/01-live-session/decisions.md)).
 */
export function Conversation({ messages, tools, isPartial }: ConversationProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      {isPartial && (
        <p className="rounded bg-muted p-2 text-xs" role="note">
          {t('session.screen.partial')}
        </p>
      )}

      {messages.length === 0 && tools.length === 0 && (
        <EmptyState
          title={t('session.screen.emptyTitle')}
          description={t('session.screen.emptyDescription')}
        />
      )}

      {messages.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label={t('session.screen.conversation')}>
          {messages.map((message) => (
            <li key={message.messageId} className="flex flex-col gap-1">
              <span className="text-xs uppercase opacity-70">
                {t(`session.role.${message.role}`)}
              </span>
              <p className="text-sm whitespace-pre-wrap">{message.text}</p>
            </li>
          ))}
        </ul>
      )}

      {tools.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('session.screen.tools')}>
          {tools.map((tool) => (
            <ToolCard key={tool.toolUseId} tool={tool} />
          ))}
        </ul>
      )}
    </div>
  );
}

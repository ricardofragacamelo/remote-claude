import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useSubagentHistory } from '../../hooks/useSubagentHistory';
import type { ToolExecution } from '../../types/live-session';
import { TimelineEntries } from './TimelineEntries';
import type { TimelineContext } from './timeline-context';

/**
 * What a subagent said, nested under the tool that opened it (plan 08, B-21): the stream brings it
 * marked with that tool, so two subagents in parallel never mix (S-89); the history keeps it apart,
 * and it is loaded only when the row is unfolded (S-90).
 */
export function SubagentChildren({
  tool,
  context,
}: {
  readonly tool: ToolExecution;
  readonly context: TimelineContext;
}): React.JSX.Element {
  const { t } = useTranslation();
  const streamed = context.conversation.timeline.some(
    (entry) =>
      (entry.kind === 'message'
        ? context.conversation.messages.find((message) => message.messageId === entry.id)
            ?.parentToolUseId
        : context.conversation.tools.find((each) => each.toolUseId === entry.id)
            ?.parentToolUseId) === tool.toolUseId,
  );
  const history = useSubagentHistory(context.conversationId, tool.toolUseId, !streamed);

  if (streamed) {
    return <TimelineEntries context={context} parent={tool.toolUseId} />;
  }

  if (history.isLoading) {
    return <Skeleton className="h-8" aria-label={t('sessions.subagent.loading')} />;
  }

  if (history.error !== null) {
    return <ErrorState error={history.error} onRetry={history.retry} />;
  }

  return history.conversation === null ? (
    <p className="text-ui-xs text-muted-foreground">{t('sessions.subagent.nothing')}</p>
  ) : (
    <TimelineEntries
      context={{ ...context, conversation: history.conversation }}
      parent={tool.toolUseId}
    />
  );
}

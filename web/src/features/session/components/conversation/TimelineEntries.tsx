import { useTranslation } from 'react-i18next';

import type { TimelineEntry } from '../../types/live-session';
import { InlinePermission } from './InlinePermission';
import { MessageItem } from './MessageItem';
import { ToolRow } from './ToolRow';
import { CompactedRow, RewoundRow, TurnRow } from './TurnRow';
import type { TimelineContext } from './timeline-context';

/** The subagent an entry belongs to — `null` for the main conversation. */
function parentOfEntry(entry: TimelineEntry, context: TimelineContext): string | null | undefined {
  if (entry.kind === 'message') {
    return context.conversation.messages.find((message) => message.messageId === entry.id)
      ?.parentToolUseId;
  }
  if (entry.kind === 'tool') {
    return context.conversation.tools.find((tool) => tool.toolUseId === entry.id)?.parentToolUseId;
  }
  return null;
}

/**
 * A tool of the timeline: its line — or, while it asks to run, its card, whole, in its own place
 * (plan 09, B-23).
 */
function ToolEntry({
  toolUseId,
  context,
}: {
  readonly toolUseId: string;
  readonly context: TimelineContext;
}): React.JSX.Element | null {
  const tool = context.conversation.tools.find((each) => each.toolUseId === toolUseId);
  const request = context.inline?.requests.byTool.get(toolUseId);

  if (tool === undefined) {
    return null;
  }

  return request === undefined || context.inline === undefined ? (
    <ToolRow tool={tool} context={context} />
  ) : (
    <InlinePermission request={request} inline={context.inline} />
  );
}

/** One entry of the timeline, drawn as what it is. */
function Entry({
  entry,
  context,
}: {
  readonly entry: TimelineEntry;
  readonly context: TimelineContext;
}): React.JSX.Element | null {
  const { conversation } = context;

  switch (entry.kind) {
    case 'message': {
      const message = conversation.messages.find((each) => each.messageId === entry.id);
      return message === undefined ? null : <MessageItem message={message} context={context} />;
    }
    case 'tool':
      return <ToolEntry toolUseId={entry.id} context={context} />;
    case 'turn': {
      const turn = conversation.turns.find((each) => each.turnId === entry.id);
      return turn === undefined ? null : <TurnRow turn={turn} />;
    }
    case 'compacted':
      return <CompactedRow trigger={entry.trigger} preTokens={entry.preTokens} />;
    case 'rewound':
      return <RewoundRow entry={entry} />;
  }
}

/**
 * The entries of one level of the conversation, in the order they happened — the main conversation
 * (`parent` `null`), or what one subagent said (its tool's id). Each entry is drawn once, at its own
 * level: what a subagent said is never drawn in the main list too.
 */
export function TimelineEntries({
  context,
  parent,
}: {
  readonly context: TimelineContext;
  readonly parent: string | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const entries = context.conversation.timeline.filter(
    (entry) => (parentOfEntry(entry, context) ?? null) === parent,
  );

  return (
    <ul
      className="flex flex-col gap-2"
      aria-label={parent === null ? t('session.screen.conversation') : t('sessions.subagent.label')}
    >
      {entries.map((entry) => (
        <Entry key={`${entry.kind}:${entry.id}`} entry={entry} context={context} />
      ))}
    </ul>
  );
}

import { useTranslation } from 'react-i18next';

import type { StreamMessage, TimelineEntry } from '../../types/live-session';
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

/** Whether a message has anything to draw — an answer of only a tool's call has not (S-109). */
function isVisible(message: StreamMessage): boolean {
  return message.blocks.length > 0 || message.streaming !== null;
}

/**
 * The messages of a level that open their turn's run of answers — the ones that say who speaks
 * (plan 22, D-16). A prompt always does: it is where a turn begins, a queued one in the middle of a
 * turn too (S-110). An answer does when nothing before it in the turn said "Claude": each round trip
 * of a tool is a new answer of the API, and the author is said once (S-108). A message with nothing
 * to draw says nothing, and leaves the turn as it was. The end of a turn, a compaction or a rewind
 * closes the run, so the next answer names its author again.
 */
function authorsOf(
  entries: readonly TimelineEntry[],
  messages: readonly StreamMessage[],
): ReadonlySet<string> {
  const byId = new Map(messages.map((message) => [message.messageId, message]));
  const authors = new Set<string>();
  let said: StreamMessage['role'] | null = null;

  for (const entry of entries) {
    if (entry.kind === 'message') {
      const message = byId.get(entry.id);

      if (message !== undefined && isVisible(message)) {
        if (message.role === 'user' || said !== 'assistant') {
          authors.add(message.messageId);
        }
        said = message.role;
      }
    } else if (entry.kind !== 'tool') {
      said = null;
    }
  }

  return authors;
}

/** One entry of the timeline, drawn as what it is. */
function Entry({
  entry,
  context,
  showsAuthor,
}: {
  readonly entry: TimelineEntry;
  readonly context: TimelineContext;

  /** It is the message that says who speaks in its turn. */
  readonly showsAuthor: boolean;
}): React.JSX.Element | null {
  const { conversation } = context;

  switch (entry.kind) {
    case 'message': {
      const message = conversation.messages.find((each) => each.messageId === entry.id);
      return message === undefined || !isVisible(message) ? null : (
        <MessageItem message={message} context={context} showsAuthor={showsAuthor} />
      );
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
  const authors = authorsOf(entries, context.conversation.messages);

  return (
    <ul
      className="flex flex-col gap-2"
      aria-label={parent === null ? t('session.screen.conversation') : t('sessions.subagent.label')}
    >
      {entries.map((entry) => (
        <Entry
          key={`${entry.kind}:${entry.id}`}
          entry={entry}
          context={context}
          showsAuthor={entry.kind === 'message' && authors.has(entry.id)}
        />
      ))}
    </ul>
  );
}

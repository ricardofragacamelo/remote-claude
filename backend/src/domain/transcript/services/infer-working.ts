import type { TranscriptMessage } from '../value-objects/transcript-message.value-object';
import type { TranscriptActivity } from './transcript-activity';

/**
 * Whether Claude seems to be working on a conversation in another client (plan 22, B-15, D-12).
 *
 * The transcript records no state of the turn, so this is an inference and the screen says it is one.
 * It is `true` only when the conversation is `activeElsewhere` — written within the window — **and** its
 * last entry leaves the turn open: a tool call whose result has not come, a thinking, a prompt without
 * an answer, a tool result the model has not answered yet. The answer that closes a turn is a message
 * of the assistant made only of text; after it, or once the window has passed, nothing is said to be
 * working. Ours is never `activeElsewhere`, and a live one is shown by its own screen.
 */
export function inferWorking(
  entries: readonly TranscriptMessage[],
  activity: TranscriptActivity,
): boolean {
  const last = entries.at(-1);

  return activity === 'activeElsewhere' && last !== undefined && !closesTheTurn(last);
}

/** Whether an entry is an answer of the assistant made only of text, with no tool after it. */
function closesTheTurn(entry: TranscriptMessage): boolean {
  return (
    entry.events.length > 0 &&
    entry.events.every(
      (event) =>
        event.type === 'message.completed' &&
        event.payload['role'] === 'assistant' &&
        onlyText(event.payload['content']),
    )
  );
}

/** Whether a content of the contract holds text blocks and nothing else. */
function onlyText(content: unknown): boolean {
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every(
      (block: unknown) =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text',
    )
  );
}

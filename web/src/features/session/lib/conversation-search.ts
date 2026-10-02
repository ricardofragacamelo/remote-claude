import type { StreamMessage } from '../types/live-session';

/** How many times `needle` occurs in `text`, case aside. */
function countIn(text: string, needle: string): number {
  const haystack = text.toLocaleLowerCase();
  let count = 0;

  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    count += 1;
  }

  return count;
}

/** The text of a message a search reads: the answer and the thinking shown. */
function searchable(message: StreamMessage): string {
  return [...message.blocks.map((block) => block.text), message.streaming?.text ?? ''].join('\n');
}

/**
 * Every occurrence of a search in the messages loaded, as the message it is in — one entry per
 * occurrence, in the order of the conversation, so "next" walks them one at a time (plan 08, B-24).
 * What arrives while the search is open is searched too: the messages are read as they are now
 * (S-102). An empty search finds nothing.
 */
export function occurrencesIn(messages: readonly StreamMessage[], query: string): string[] {
  const needle = query.trim().toLocaleLowerCase();

  if (needle === '') {
    return [];
  }

  return messages.flatMap((message) =>
    Array.from({ length: countIn(searchable(message), needle) }, () => message.messageId),
  );
}

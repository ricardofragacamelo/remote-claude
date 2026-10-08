import type { TranscriptMessage } from '../value-objects/transcript-message.value-object';

/** What came after an entry: the entries, or the news that the entry is no longer in the chain. */
export type TranscriptTail =
  | { readonly kind: 'tail'; readonly entries: readonly TranscriptMessage[] }
  | { readonly kind: 'outside' };

/**
 * The entries of a conversation after the one a reader has (plan 22, B-14).
 *
 * In the order of the chain the SDK returns — never of the clock: a prompt queued mid-turn is stamped
 * before the result that precedes it, and the model read it after (S-21). With no entry given — the
 * conversation the reader saw was empty — everything is new. An entry the chain no longer holds — a
 * rewind, a compaction or a fork rebuilt it — is `outside`: nothing after it can be told apart from
 * what replaced it, so the reader starts again rather than patching (S-43).
 */
export function transcriptTail(
  entries: readonly TranscriptMessage[],
  afterId: string | null,
): TranscriptTail {
  if (afterId === null) {
    return { kind: 'tail', entries };
  }

  const index = entries.findIndex((entry) => entry.id === afterId);

  return index === -1 ? { kind: 'outside' } : { kind: 'tail', entries: entries.slice(index + 1) };
}

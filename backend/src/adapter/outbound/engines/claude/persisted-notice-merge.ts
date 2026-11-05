import type { TranscriptMessage } from '@domain/transcript';
import type { SessionNoticePayload } from '@remote-claude/contracts';

/** A [TranscriptMessage] of the real transcript, carrying the `timestamp` it was read with (B-17). */
export interface TimedTranscriptMessage extends TranscriptMessage {
  readonly at?: string;
}

/** One `session.notice` this store kept, as a [TranscriptMessage] of its own — never a real one. */
function asMessage(payload: SessionNoticePayload): TimedTranscriptMessage {
  return {
    id: `persisted-notice:${payload.noticeId}`,
    events: [{ type: 'session.notice', payload: payload as unknown as Record<string, unknown> }],
    ...(payload.at === undefined ? {} : { at: payload.at }),
  };
}

/** Every `noticeId` a `session.notice` of [messages] already carries. */
function noticeIdsOf(messages: readonly TimedTranscriptMessage[]): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const message of messages) {
    for (const event of message.events) {
      if (event.type === 'session.notice' && typeof event.payload['noticeId'] === 'string') {
        ids.add(event.payload['noticeId']);
      }
    }
  }

  return ids;
}

/**
 * [messages], with [notices] merged in — Plan 27, F7, D-15.
 *
 * A notice whose `noticeId` [messages] already carries (the compaction's `command.output`, today)
 * is **not** added again: the real transcript's own reconstruction wins, and the persisted copy is
 * discarded (S-119) — re-running this merge over the same input is a no-op either way (S-120).
 *
 * Positioned by `at` against each real message's own `at` (both ISO 8601, the same format, so a
 * plain string comparison orders them) — a best effort, not a guarantee: a message or a notice with
 * no `at` at all compares equal to everything, and keeps its place in the input order instead of
 * being moved (the same kind of documented best-effort gap as a `session.compacted` read from
 * history always naming its trigger `manual`, B-18).
 */
export function mergedWithPersistedNotices(
  messages: readonly TimedTranscriptMessage[],
  notices: readonly SessionNoticePayload[],
): readonly TimedTranscriptMessage[] {
  const known = noticeIdsOf(messages);
  const added = notices.filter((notice) => !known.has(notice.noticeId)).map(asMessage);

  if (added.length === 0) {
    return messages;
  }

  return [...messages, ...added].sort((before, after) => {
    if (before.at === undefined || after.at === undefined) {
      return 0;
    }
    return before.at < after.at ? -1 : before.at > after.at ? 1 : 0;
  });
}

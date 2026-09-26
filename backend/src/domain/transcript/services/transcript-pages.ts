import type { TranscriptSession } from '../entities/transcript-session.entity';
import { TranscriptCursorStaleError } from '../errors/transcript-cursor-stale.error';
import type { TranscriptMessage } from '../value-objects/transcript-message.value-object';

/** A slice of something longer, and where the next one starts — `null` on the last. */
export interface Page<T, C> {
  readonly items: readonly T[];
  readonly next: C | null;
}

/**
 * Where a page of the session listing ends: the last session it held.
 *
 * A keyset over `(lastModified, id)`, not an offset. The order of `listSessions` changes under a
 * concurrent write — it happened inside the probe itself, in under a second — and an offset over a
 * list that reorders skips one row and repeats another
 * ([D-02](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 */
export interface SessionListCursor {
  readonly lastModified: number;
  readonly id: string;
}

/**
 * One page of sessions, most recently written first.
 *
 * The order is total — `lastModified` descending, then the id — so two sessions written in the
 * same millisecond still have a place each, and the cursor names exactly one of them. A session
 * that is written while somebody pages moves **up**, above the window already read: it is not
 * served twice, and nothing below it is skipped (S-57).
 */
export function pageOfSessions<T extends TranscriptSession>(
  sessions: readonly T[],
  after: SessionListCursor | null,
  limit: number,
): Page<T, SessionListCursor> {
  const ordered = [...sessions].sort(newestFirst);
  const rest = after === null ? ordered : ordered.filter((session) => isAfter(session, after));
  const items = rest.slice(0, limit);
  const last = items.at(-1);

  return {
    items,
    next:
      rest.length > limit && last !== undefined
        ? { lastModified: last.lastModified, id: last.id.value }
        : null,
  };
}

/**
 * One page of a conversation, read **from the tail**: the latest messages first, older on demand.
 *
 * From the tail because the reason to open a conversation is to continue it, and a conversation is
 * read like a chat. The page itself is in chronological order; `next` points at the oldest
 * message it holds, and the page after it is what came before that one
 * ([D-02](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 *
 * The cursor is a message id, not a position. A live session only ever appends, so what came
 * before a message stays what it was while the tail grows (S-08, S-57); and a position would keep
 * pointing somewhere after a compaction rebuilt the chain, silently at the wrong message.
 *
 * @param before the id the previous page handed out, or `null` for the tail
 * @throws {TranscriptCursorStaleError} that message is no longer in the conversation (S-69)
 */
export function pageFromTail(
  sessionId: string,
  messages: readonly TranscriptMessage[],
  before: string | null,
  limit: number,
): Page<TranscriptMessage, string> {
  const end = before === null ? messages.length : messages.findIndex(({ id }) => id === before);

  if (end === -1) {
    throw new TranscriptCursorStaleError(sessionId);
  }

  const start = Math.max(0, end - limit);
  const items = messages.slice(start, end);
  const first = items[0];

  return { items, next: start > 0 && first !== undefined ? first.id : null };
}

/** `lastModified` descending, then the id descending: a total order, so a cursor is exact. */
function newestFirst(left: TranscriptSession, right: TranscriptSession): number {
  if (left.lastModified !== right.lastModified) {
    return right.lastModified - left.lastModified;
  }

  return compare(right.id.value, left.id.value);
}

/** Whether a session sorts strictly after the cursor. */
function isAfter(session: TranscriptSession, cursor: SessionListCursor): boolean {
  return (
    session.lastModified < cursor.lastModified ||
    (session.lastModified === cursor.lastModified && compare(session.id.value, cursor.id) < 0)
  );
}

/** Code-unit order, never the locale's: a cursor must sort the same on every machine. */
function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

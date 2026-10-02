import type { VisibleTranscriptSession } from '../entities/transcript-session.entity';

/**
 * What a conversation is doing now, as far as this backend can tell (plan 08, B-08).
 *
 * - `liveHere` — a live session **of the caller** holds it: opened here, resumed, or the fork that
 *   continues it. That one is known, not guessed;
 * - `activeElsewhere` — a conversation begun **elsewhere** whose transcript was written within the
 *   window. An estimate: there is no way to tell that an editor has it open (discovery §9.4), only
 *   that something wrote to it recently;
 * - `idle` — everything else.
 */
export type TranscriptActivity = 'liveHere' | 'activeElsewhere' | 'idle';

/** A conversation's activity, with what the screen needs to say it honestly. */
export interface ConversationActivity {
  readonly activity: TranscriptActivity;

  /** The live session that holds it, when it is `liveHere`; `null` otherwise. */
  readonly liveSessionId: string | null;

  /** How long ago it was last written, in whole seconds — what "written n min ago" is made of. */
  readonly writtenAgoSeconds: number;
}

/** What the rule needs beside the conversation: what is live, the clock and the window. */
export interface ActivityContext {
  /** The caller's live session holding this conversation, or `null`. */
  readonly liveSessionId: string | null;

  /** Now, in milliseconds since the epoch — the backend's clock, so both ends agree. */
  readonly now: number;

  /** How recently a conversation begun elsewhere has to have been written to read as active. */
  readonly windowMs: number;
}

/**
 * The activity of one conversation.
 *
 * **Ours is never `activeElsewhere`** (S-28): a conversation this backend opened is live here or it is
 * not, and when it is not, whoever wrote it last was us — reading our own recent write as somebody
 * else's would make every conversation just closed look as if an editor had it open. The window is
 * inclusive: written exactly `windowMs` ago is still active, a millisecond more is not (S-26). A
 * `lastModified` in the future — a clock ahead of ours — reads as written now.
 */
export function activityOf(
  session: VisibleTranscriptSession,
  context: ActivityContext,
): ConversationActivity {
  const silenceMs = Math.max(0, context.now - session.lastModified);
  const writtenAgoSeconds = Math.floor(silenceMs / 1_000);

  if (context.liveSessionId !== null) {
    return { activity: 'liveHere', liveSessionId: context.liveSessionId, writtenAgoSeconds };
  }

  const recent = session.origin === 'external' && silenceMs <= context.windowMs;

  return { activity: recent ? 'activeElsewhere' : 'idle', liveSessionId: null, writtenAgoSeconds };
}

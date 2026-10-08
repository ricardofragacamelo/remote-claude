import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import { activityOf, transcriptOriginFor } from '@domain/transcript';
import type {
  ConversationActivity,
  TranscriptSession,
  VisibleTranscriptSession,
} from '@domain/transcript';
import type { WorkspaceAllowlistSource } from '@application/workspace';
import type { LiveConversationSource } from './ports/live-conversation.source';
import type { TranscriptOriginSource } from './ports/transcript-origin.source';

/** A conversation as its caller sees it: what the SDK said, where it came from, what it is doing. */
export interface ListedTranscript extends VisibleTranscriptSession {
  readonly activity: ConversationActivity;
}

/** What the listing needs to say what a conversation is doing: the clock, and how long "recent" is. */
export interface TranscriptActivitySettings {
  readonly clock: Clock;

  /** How recently a conversation begun elsewhere has to have been written to read as active there. */
  readonly activeWindowMs: number;
}

/** The allowlist as it stands now — what one answer is fenced with, start to end. */
type Allowlist = ReturnType<WorkspaceAllowlistSource['current']>;

/**
 * Who sees a conversation, and what it is doing for them — the one fence the listing and the reader
 * share: a conversation that would not be **listed** for a caller is not **read** by them either
 * (S-04), and both say it is live here, active elsewhere or idle the same way (plan 08, B-08).
 */
export class TranscriptAudience {
  constructor(
    private readonly allowlist: WorkspaceAllowlistSource,
    private readonly origins: TranscriptOriginSource,
    private readonly live: LiveConversationSource,
    private readonly activity: TranscriptActivitySettings,
  ) {}

  /**
   * The sessions this caller may see, in the order given, each with its origin and what it is doing
   * now — the others are left out, never marked.
   *
   * @param allowlist the one the caller's path was resolved with, so a reload of it mid-answer
   *   cannot fence the path and the sessions differently
   */
  async shown(
    sessions: readonly TranscriptSession[],
    userId: UserId,
    allowlist: Allowlist = this.allowlist.current(),
  ): Promise<ListedTranscript[]> {
    const openers = await this.origins.openersOf(sessions.map((session) => session.id));
    const now = this.activity.clock.now().getTime();

    return sessions.flatMap((session): ListedTranscript[] => {
      const origin = transcriptOriginFor(session, {
        allowlist,
        userId,
        openedBy: openers.get(session.id.value),
      });

      if (origin === null) {
        return [];
      }

      return [this.withActivity({ ...session, origin }, userId, now)];
    });
  }

  /**
   * A conversation already shown to this caller, with what it is doing **now** — without asking the
   * database again who opened it (plan 22, B-16). The follower recomputes this every tick, between the
   * reads that run the whole fence: the clock moves the window, and a live session may have taken the
   * conversation, and neither is an I/O.
   */
  activityNow(session: VisibleTranscriptSession, userId: UserId): ListedTranscript {
    return this.withActivity(session, userId, this.activity.clock.now().getTime());
  }

  private withActivity(
    visible: VisibleTranscriptSession,
    userId: UserId,
    now: number,
  ): ListedTranscript {
    return {
      ...visible,
      activity: activityOf(visible, {
        liveSessionId: this.live.liveSessionOf(visible.id, userId),
        now,
        windowMs: this.activity.activeWindowMs,
      }),
    };
  }
}

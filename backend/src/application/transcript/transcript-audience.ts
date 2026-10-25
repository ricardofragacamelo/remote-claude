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
import type { TranscriptStore } from './ports/transcript-store.port';
import type { TranscriptOriginSource } from './ports/transcript-origin.source';

/** A conversation as its caller sees it: what the engine said, where it came from, what it is doing. */
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
        openedBy: openers.get(session.id.key),
      });

      if (origin === null) {
        return [];
      }

      return [this.withActivity({ ...session, origin }, userId, now)];
    });
  }

  /**
   * [session], with its folder found by listing [hint] and then every root [userId] may use, when
   * the engine could not say it by id alone.
   *
   * The engine normally reads a conversation's folder straight from its id, but a transcript heavy
   * enough — a prompt's embedded image, say — can push the line that names it out of the window the
   * engine scans, and an id-only read then answers with no folder at all, which the fence reads as
   * "not addressable" even though the same conversation still lists correctly wherever its folder is
   * already known (S-163). `hint` is never trusted on its own — it only changes which directory is
   * listed first, and the usual fence runs on the folder the listing itself reports, exactly as
   * without one. A root of the allowlist is tried only when an exact root of the installation happens
   * to be the conversation's own folder; a caller who already knows that folder — because it just
   * listed or is following the conversation — should say so with `hint` instead.
   */
  async resolved(
    store: Pick<TranscriptStore, 'list'>,
    session: TranscriptSession,
    userId: UserId,
    hint: string | null = null,
  ): Promise<TranscriptSession> {
    if (session.cwd !== null) {
      return session;
    }

    const roots = [
      ...(hint === null ? [] : [hint]),
      ...this.allowlist.current().for(userId).map((workspace) => workspace.root.value),
    ];

    for (const root of roots) {
      const found = (await store.list(root)).find(
        (candidate) => candidate.id.key === session.id.key,
      );

      if (found !== undefined) {
        return found;
      }
    }

    return session;
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

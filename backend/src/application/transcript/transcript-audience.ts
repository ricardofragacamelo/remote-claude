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
 * How many conversations' folders [TranscriptAudience.resolved] remembers, once found — so a
 * follow, a subagent or a tool's output never has to rediscover what a listing or a read already
 * found for the same conversation (S-163). The oldest goes when a new one would not fit; a few
 * hundred is far more than the conversations open at once in an installation this size.
 */
const RESOLVED_FOLDER_CAPACITY = 500;

/**
 * Who sees a conversation, and what it is doing for them — the one fence the listing and the reader
 * share: a conversation that would not be **listed** for a caller is not **read** by them either
 * (S-04), and both say it is live here, active elsewhere or idle the same way (plan 08, B-08).
 */
export class TranscriptAudience {
  /**
   * Every conversation's folder this instance has ever seen resolved, by its key — populated by
   * every listing and every successful resolution, read by the next one that cannot resolve its
   * own (S-163). See {@link resolved}.
   */
  private readonly resolvedFolders = new Map<string, string>();

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

    sessions.forEach((session) => {
      this.remember(session);
    });

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
   * already known (S-163). Tried in order: a folder this instance has already resolved for the same
   * conversation (by a listing, or by another read of it); then `hint`, never trusted on its own —
   * it only changes which directory is listed first, and the usual fence runs on the folder the
   * listing itself reports, exactly as without one; then every root of the allowlist, in case one of
   * them happens to be the conversation's own folder exactly. A caller who already knows the folder
   * — because it just listed it, or is following the conversation — should say so with `hint`.
   */
  async resolved(
    store: Pick<TranscriptStore, 'list'>,
    session: TranscriptSession,
    userId: UserId,
    hint: string | null = null,
  ): Promise<TranscriptSession> {
    if (session.cwd !== null) {
      this.remember(session);
      return session;
    }

    const known = this.resolvedFolders.get(session.id.key);
    if (known !== undefined) {
      return { ...session, cwd: known };
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
        this.remember(found);
        return found;
      }
    }

    return session;
  }

  /**
   * Keeps [session]'s folder for {@link resolved} to find later, bumping it to the front of the
   * remembered set — the oldest goes when it would grow past {@link RESOLVED_FOLDER_CAPACITY}.
   * Nothing to remember when the engine did not say a folder.
   */
  private remember(session: TranscriptSession): void {
    if (session.cwd === null) {
      return;
    }

    this.resolvedFolders.delete(session.id.key);
    this.resolvedFolders.set(session.id.key, session.cwd);

    if (this.resolvedFolders.size > RESOLVED_FOLDER_CAPACITY) {
      const oldest = this.resolvedFolders.keys().next().value;

      if (oldest !== undefined) {
        this.resolvedFolders.delete(oldest);
      }
    }
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

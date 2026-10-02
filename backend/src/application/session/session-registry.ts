import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import {
  Session,
  SessionForbiddenError,
  SessionLimitReachedError,
  SessionNotFoundError,
} from '@domain/session';
import type { SessionId } from '@domain/session';
import type { ClaudeSessionId } from '@domain/transcript';
import type { SessionConversations } from './attach-session.use-case';
import type { ClaudeSessionHandle, SessionConversation } from './ports/claude-session.port';

/** A live session, the subprocess behind it, and the conversation of Claude it is. */
export interface LiveSession {
  readonly session: Session;
  readonly handle: ClaudeSessionHandle;
  readonly conversation: SessionConversation;
}

/**
 * The sessions that are running, in memory.
 *
 * In memory and not in PostgreSQL, deliberately: an entry is a subprocess, a `for await` and a set
 * of pending promises, none of which survive a restart. A table of live sessions would be a table
 * of rows that are all lies the moment the process dies —
 * docs/architecture/backend/06-realtime.md.
 *
 * It owns the concurrency limit because it is the only thing that knows how many there are. The
 * limit is derived from the machine's RAM at boot (~222 MB and exactly one subprocess per session,
 * both measured — [D-01 of plan 05](../../../../docs/plans/05-hardening-operations/decisions.md)),
 * so the refusal is an ordinary path rather than a remote edge case, and it happens **before**
 * anything is spawned — that is what leaves no orphan behind
 * ([D-05](../../../../docs/plans/01-live-session/decisions.md)).
 *
 * It is also where a human acting on a session is noticed: every command goes through
 * {@link require}, so that is where the idle clock of the session is reset (D-02).
 */
export class SessionRegistry implements SessionConversations {
  private readonly live = new Map<string, LiveSession>();

  /**
   * Sessions whose conversation is known and whose subprocess is not up yet.
   *
   * Listed as `starting` (plan 08, S-23) — a session somebody just opened should not vanish from the
   * list for the half second it takes to spawn — and never twice: {@link add} moves it to the live
   * ones, and a start that failed takes it out with {@link withdraw}.
   */
  private readonly starting = new Map<
    string,
    { readonly session: Session; readonly conversation: SessionConversation }
  >();

  /** Reservations taken before a subprocess exists, so two starts cannot both pass the limit. */
  private reserved = 0;

  constructor(
    private readonly limit: number,
    private readonly clock: Clock,
  ) {}

  /** How many sessions this installation holds at most. */
  get capacity(): number {
    return this.limit;
  }

  /** How many sessions count against the limit right now, including the ones still starting. */
  get size(): number {
    return this.live.size + this.reserved;
  }

  /**
   * Takes one slot, before anything is spawned.
   *
   * The reservation exists because `start` is asynchronous: checking the map, awaiting the
   * subprocess and only then inserting would let the eleventh and twelfth sessions both see ten
   * and both spawn. The caller releases the slot in a `finally`.
   *
   * @throws {SessionLimitReachedError} when the installation is already at its limit
   */
  reserve(): void {
    if (this.size >= this.limit) {
      throw new SessionLimitReachedError(this.limit);
    }

    this.reserved += 1;
  }

  /** Gives a reservation back. Never takes the count below zero. */
  release(): void {
    this.reserved = Math.max(0, this.reserved - 1);
  }

  /** Puts a started session in. */
  add(entry: LiveSession): void {
    this.starting.delete(entry.session.id.value);
    this.live.set(entry.session.id.value, entry);
  }

  /** Says that a session is starting, with the conversation it is: listed, not yet drivable. */
  announce(session: Session, conversation: SessionConversation): void {
    this.starting.set(session.id.value, { session, conversation });
  }

  /** Takes back a start that never became a session. Withdrawing one that started is a no-op. */
  withdraw(id: SessionId): void {
    this.starting.delete(id.value);
  }

  /**
   * Every session a list may show — the live ones and the ones starting — with its conversation.
   *
   * Only for reading: a starting session has no handle yet, and nothing may drive it.
   */
  listed(): readonly { readonly session: Session; readonly conversation: SessionConversation }[] {
    return [...this.live.values(), ...this.starting.values()];
  }

  /** The session, or `null` when no live session has that id. */
  find(id: SessionId): LiveSession | null {
    return this.live.get(id.value) ?? null;
  }

  /** The conversation of a live session, or `null` when no live session has that id. */
  conversationOf(id: SessionId): SessionConversation | null {
    return this.find(id)?.conversation ?? null;
  }

  /**
   * The live session of this user that **is** a conversation — or continues it — or `null`.
   *
   * It is what makes resuming what is already live an attach rather than a second subprocess on
   * the same conversation (S-24). Both ids are asked: the conversation itself, for one of ours
   * continued in place, and the one it continues, for a fork — resuming the editor's conversation
   * twice is the same request, and a second fork of it would be a second subprocess answering it.
   *
   * Only the caller's own: somebody else's live continuation of a conversation begun elsewhere is
   * theirs, and the caller gets a fork of their own.
   */
  findConversation(id: ClaudeSessionId, userId: UserId): LiveSession | null {
    for (const entry of this.live.values()) {
      const { claudeSessionId, resumedFrom } = entry.conversation;
      const continues = claudeSessionId.equals(id) || (resumedFrom?.equals(id) ?? false);

      if (continues && entry.session.isOwnedBy(userId) && !entry.session.isClosed) {
        return entry;
      }
    }

    return null;
  }

  /**
   * The session, if this user may act on it — and a human acting on it is activity.
   *
   * **Two questions, two answers.** A session that is not running is `404`; one that is running
   * and belongs to somebody else is `403`. The earlier design collapsed both into `404` so that a
   * refusal would not confirm an id somebody is probing for — a semantics of its own, and one
   * that leaves a client unable to tell "it is gone" from "it is not yours"
   * ([D-17](../../../../docs/plans/01-live-session/decisions.md)).
   *
   * @throws {SessionNotFoundError} when no live session has that id
   * @throws {SessionForbiddenError} when it is running and is somebody else's
   */
  require(id: SessionId, userId: UserId): LiveSession {
    const entry = this.find(id);

    if (entry === null) {
      throw new SessionNotFoundError(id.value);
    }

    if (!entry.session.isOwnedBy(userId)) {
      throw new SessionForbiddenError(id.value);
    }

    entry.session.recordActivity(this.clock.now());
    return entry;
  }

  /** Forgets a session. Forgetting one that is not there is not an error. */
  remove(id: SessionId): void {
    this.live.delete(id.value);
  }

  /** Every live session, for the shutdown hook to close them all. */
  all(): readonly LiveSession[] {
    return [...this.live.values()];
  }
}

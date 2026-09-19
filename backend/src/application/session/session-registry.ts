import type { UserId } from '@domain/auth';
import {
  Session,
  SessionForbiddenError,
  SessionLimitReachedError,
  SessionNotFoundError,
} from '@domain/session';
import type { SessionId } from '@domain/session';
import type { ClaudeSessionHandle } from './ports/claude-session.port';

/** A live session and the subprocess behind it. */
export interface LiveSession {
  readonly session: Session;
  readonly handle: ClaudeSessionHandle;
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
 * limit is a configured number with a default of **10** (~222 MB and exactly one subprocess per
 * session, both measured), so the refusal is an ordinary path rather than a remote edge case, and
 * it happens **before** anything is spawned — that is what leaves no orphan behind
 * ([D-05](../../../../docs/plans/01-live-session/decisions.md)).
 */
export class SessionRegistry {
  private readonly live = new Map<string, LiveSession>();

  /** Reservations taken before a subprocess exists, so two starts cannot both pass the limit. */
  private reserved = 0;

  constructor(private readonly limit: number) {}

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
    this.live.set(entry.session.id.value, entry);
  }

  /** The session, or `null` when no live session has that id. */
  find(id: SessionId): LiveSession | null {
    return this.live.get(id.value) ?? null;
  }

  /**
   * The session, if this user may act on it.
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

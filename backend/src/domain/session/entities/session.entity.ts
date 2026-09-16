import type { UserId } from '@domain/auth';
import { Pong } from '../value-objects/pong.value-object';
import type { SessionId } from '../value-objects/session-id.value-object';

/** The persisted shape of a session, as the mapper on either side of the repository sees it. */
export interface SessionSnapshot {
  readonly id: SessionId;
  readonly ownerId: UserId;
  readonly openedAt: Date;
  readonly lastPingedAt: Date;
  readonly pingCount: number;
}

/**
 * A session of the walking skeleton.
 *
 * Deliberately trivial in business terms and complete in structure: the value of the slice is in
 * the rail it proves, not in what it computes. The rule it does own — the pong carries the
 * instant the injected clock reported, and the count is the entity's to increment — is enough to
 * show that the rule lives here and not in the gateway.
 */
export class Session {
  private constructor(
    readonly id: SessionId,
    readonly ownerId: UserId,
    readonly openedAt: Date,
    private lastPinged: Date,
    private pings: number,
  ) {}

  /** A session that has just been opened and never pinged. */
  static open(id: SessionId, ownerId: UserId, now: Date): Session {
    return new Session(id, ownerId, now, now, 0);
  }

  /** Rehydrates a session the repository read back. */
  static restore(snapshot: SessionSnapshot): Session {
    return new Session(
      snapshot.id,
      snapshot.ownerId,
      snapshot.openedAt,
      snapshot.lastPingedAt,
      snapshot.pingCount,
    );
  }

  get lastPingedAt(): Date {
    return this.lastPinged;
  }

  get pingCount(): number {
    return this.pings;
  }

  /** Whether this session belongs to `userId`. */
  isOwnedBy(userId: UserId): boolean {
    return this.ownerId.equals(userId);
  }

  /**
   * Records a ping and answers the pong it produced.
   *
   * @param now instant from the clock — the entity never reads the wall clock itself
   * @param nonce echoed back so a client can recognise its own round trip
   */
  ping(now: Date, nonce: string): Pong {
    this.pings += 1;
    this.lastPinged = now;

    return new Pong(this.id, now, this.pings, nonce);
  }

  snapshot(): SessionSnapshot {
    return {
      id: this.id,
      ownerId: this.ownerId,
      openedAt: this.openedAt,
      lastPingedAt: this.lastPinged,
      pingCount: this.pings,
    };
  }
}

import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import { Pong } from '../value-objects/pong.value-object';

/** The persisted shape of a diagnostic session, as the mapper on either side of it sees it. */
export interface DiagSessionSnapshot {
  readonly id: SessionId;
  readonly ownerId: UserId;
  readonly openedAt: Date;
  readonly lastPingedAt: Date;
  readonly pingCount: number;
}

/**
 * The counter behind `diag.ping`.
 *
 * It is **not** a session of Claude — see {@link import('@domain/session').Session} for that one.
 * This is the diagnostic round trip of the gateway: the cheapest smoke test of the whole rail, and
 * the only one that needs no Claude subprocess (D-01 of the live-session plan).
 *
 * Deliberately trivial in business terms and complete in structure: the value of the slice is in
 * the rail it proves, not in what it computes. The rule it does own — the pong carries the
 * instant the injected clock reported, and the count is the entity's to increment — is enough to
 * show that the rule lives here and not in the gateway.
 */
export class DiagSession {
  private constructor(
    readonly id: SessionId,
    readonly ownerId: UserId,
    readonly openedAt: Date,
    private lastPinged: Date,
    private pings: number,
  ) {}

  /** A diagnostic session that has just been opened and never pinged. */
  static open(id: SessionId, ownerId: UserId, now: Date): DiagSession {
    return new DiagSession(id, ownerId, now, now, 0);
  }

  /** Rehydrates a diagnostic session the repository read back. */
  static restore(snapshot: DiagSessionSnapshot): DiagSession {
    return new DiagSession(
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

  snapshot(): DiagSessionSnapshot {
    return {
      id: this.id,
      ownerId: this.ownerId,
      openedAt: this.openedAt,
      lastPingedAt: this.lastPinged,
      pingCount: this.pings,
    };
  }
}

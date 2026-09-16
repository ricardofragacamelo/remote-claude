import type { SessionId } from './session-id.value-object';

/**
 * What a ping produced: the instant the server clock reported, and how many pings that session
 * has taken. Immutable, and equal by content.
 */
export class Pong {
  constructor(
    readonly sessionId: SessionId,
    readonly pingedAt: Date,
    readonly pingCount: number,
    readonly nonce: string,
  ) {}

  equals(other: Pong): boolean {
    return (
      this.sessionId.equals(other.sessionId) &&
      this.pingedAt.getTime() === other.pingedAt.getTime() &&
      this.pingCount === other.pingCount &&
      this.nonce === other.nonce
    );
  }
}

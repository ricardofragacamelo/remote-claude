import type { PushTarget } from '@domain/notification';

/**
 * Which devices were told about which open question.
 *
 * In memory, and singleton with the process, exactly like the permission registry and for the
 * same reason: an open request is a promise the SDK is holding its loop for, and none of that
 * survives a restart. What is lost with it is the ability to cancel a notification the phone is
 * still showing — which the deadline on the card itself already covers, because the payload
 * carries `expiresAt` and the screen revalidates on the server before it renders (S-57).
 *
 * It is what makes two things true at once: the **same** `requestId` never sends twice (S-24),
 * and cancelling a request cancels exactly the notifications it caused, by its own tag (S-63).
 */
export class NotificationRegistry {
  private readonly sent = new Map<string, readonly PushTarget[]>();

  /** Whether this request has already been announced. */
  has(requestId: string): boolean {
    return this.sent.has(requestId);
  }

  /**
   * Records that a request was announced, and to whom.
   *
   * Called **before** the provider is reached, not after: two requests arriving together would
   * otherwise both find nothing recorded and both send.
   */
  remember(requestId: string, targets: readonly PushTarget[]): void {
    this.sent.set(requestId, targets);
  }

  /** Who was told, and forgets them. Empty when nobody was, which is the ordinary case. */
  take(requestId: string): readonly PushTarget[] {
    const targets = this.sent.get(requestId) ?? [];
    this.sent.delete(requestId);

    return targets;
  }

  /** How many questions are still announced. For a test, and for a diagnostic later. */
  get size(): number {
    return this.sent.size;
  }
}

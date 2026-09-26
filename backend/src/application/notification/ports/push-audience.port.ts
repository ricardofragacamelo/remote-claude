import type { Device, UserId } from '@domain/auth';

/**
 * Who a push can reach, and whether anybody is already looking.
 *
 * Two questions from two different modules — `auth` owns the devices, the transport owns the
 * connections — behind one port, because they are asked together and answer one question:
 * **is there anybody to tell, and do they need telling?**
 *
 * A port rather than a direct call for the usual reason: `notification` would otherwise depend on
 * `auth` and on `infrastructure/websocket`, and the arrow would point outward
 * (docs/architecture/backend/03-modules.md#fronteiras).
 */
export interface PushAudience {
  /**
   * Every approved device of the user.
   *
   * All of them, not the most recent one: notifying only the last active phone fails exactly when
   * the phone was left behind, and a permission nobody sees is a session standing still until the
   * deadline refuses it
   * ([D-04](../../../../../docs/plans/02-mobile-approval/decisions.md#d-04--todos-ou-o-último)).
   */
  approvedDevices(userId: UserId): Promise<readonly Device[]>;

  /**
   * Whether any connection of this user is watching that session **right now**.
   *
   * It is what decides whether a push is a help or an interruption: somebody with the screen open
   * has already been asked.
   */
  isWatching(userId: UserId, sessionId: string): boolean;
}

export const PUSH_AUDIENCE = Symbol('PushAudience');

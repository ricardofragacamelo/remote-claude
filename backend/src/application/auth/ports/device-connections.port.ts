import type { UserId } from '@domain/auth';

/**
 * How a revocation reaches a socket that is already open.
 *
 * Without it a revoked phone would go on answering permission requests until its access token ran
 * out — which is to say the revocation would not revoke anything for up to fifteen minutes
 * (docs/architecture/shared/08-authentication.md#token-no-websocket).
 *
 * It is a port and not a direct call because the registry of connections lives in
 * `infrastructure/websocket/`: a use case that reached for it would have the arrow pointing
 * outward.
 */
export interface DeviceConnections {
  /**
   * Closes every connection of that installation, at once, with `4401`.
   *
   * @returns how many it closed — zero is the ordinary case of a device that was not connected
   */
  closeForDevice(userId: UserId, installId: string): number;
}

export const DEVICE_CONNECTIONS = Symbol('DeviceConnections');

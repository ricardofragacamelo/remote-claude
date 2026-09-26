/** Where a device is in its life. `revoked` is terminal: bringing one back is registering again. */
export type DeviceStatus = 'pending' | 'approved' | 'revoked';

/**
 * One installation of the app, as the screen knows it.
 *
 * There is no push token here, and there never will be: the backend does not send one. The screen
 * needs to know **whether** a device can be reached, not with what.
 */
export interface Device {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly appVersion: string;
  readonly locale: string;
  readonly status: DeviceStatus;
  readonly pushEnabled: boolean;
  /** ISO-8601. */
  readonly registeredAt: string;
  readonly lastSeenAt: string;
  readonly approvedAt: string | null;
  readonly revokedAt: string | null;
}

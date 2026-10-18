import type { Device as ContractDevice } from '@remote-claude/contracts';

/** Where a device is in its life. `revoked` is terminal: bringing one back is registering again. */
export type DeviceStatus = ContractDevice['status'];

/**
 * One installation of the app, as the screen knows it (`GET /devices` and friends).
 *
 * There is no push token here, and there never will be: the backend does not send one. The screen
 * needs to know **whether** a device can be reached, not with what.
 */
export type Device = ContractDevice;

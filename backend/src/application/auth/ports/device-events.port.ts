import type { Device } from '@domain/auth';

/** A phone the user has just let decide — the device as it is now, approved. */
export interface DeviceApprovedEvent {
  readonly device: Device;
}

/**
 * The facts about a device that other modules react to, published on the internal bus.
 *
 * A port, and not a call into `notification`, because `notification` already depends on `auth` —
 * it asks `auth` which devices it may reach — and the arrow cannot point back. Whoever is
 * listening, and whether anybody is, is none of this module's business.
 */
export interface DeviceEvents {
  /**
   * Published once per approval that changed something: approving an approved device again is
   * not a second approval, and nothing is published for it (plan 17, S-122).
   */
  approved(event: DeviceApprovedEvent): void;
}

export const DEVICE_EVENTS = Symbol('DeviceEvents');

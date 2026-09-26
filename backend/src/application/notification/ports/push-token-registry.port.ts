import type { Device } from '@domain/auth';

/**
 * What to do about a token the provider refused.
 *
 * One method, and it is deliberately not "revoke the device": revoking would charge a fresh
 * approval through the browser every time the operating system rotates a token. The device stays
 * approved and starts receiving again the next time the app opens and re-sends
 * ([D-13](../../../../../docs/plans/02-mobile-approval/decisions.md#d-13--o-token-que-morre-calado)).
 */
export interface PushTokenRegistry {
  forget(device: Device): Promise<void>;
}

export const PUSH_TOKEN_REGISTRY = Symbol('PushTokenRegistry');

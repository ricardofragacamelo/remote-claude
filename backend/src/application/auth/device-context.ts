import type { Clock } from '@domain/shared';
import type { RecordAuditEventUseCase } from '@application/audit';
import type { DeviceRepository } from './ports/device.repository';

/**
 * The three things every device use case needs.
 *
 * Bundled rather than injected one by one, for the same reason
 * {@link import('@infra/database/persistence-context').PersistenceContext} is: four use cases
 * wanted the same three and said so in the same five lines. One token means one place to change
 * the day a fourth is needed, and no use case whose constructor has quietly drifted from its
 * neighbours'.
 *
 * The trail is in here and not optional: registering, approving, revoking and expiring a device
 * are security facts, and a use case that could be built without somewhere to record them is a
 * use case that will eventually be.
 */
export interface DeviceContext {
  readonly devices: DeviceRepository;

  /** Where the account facts go. A failure here fails the operation that caused it. */
  readonly trail: RecordAuditEventUseCase;

  /** Instants are stamped by the application, never read from the wall clock inside a rule. */
  readonly clock: Clock;
}

export const DEVICE_CONTEXT = Symbol('DeviceContext');

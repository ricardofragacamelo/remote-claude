import { DomainError } from '@domain/shared';

import type { NotificationProblem } from '../services/notification-catalogue';

/**
 * A notification the centre will not keep: a key outside the catalogue, or parameters that are not
 * the ones the key takes.
 *
 * `INVALID_INPUT`, with every problem in `details`, like any validation: the request was malformed
 * in a way the client can fix, and nothing was written (plan 06, S-174).
 */
export class NotificationRejectedError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'notification.error.rejected';

  constructor(readonly details: readonly NotificationProblem[]) {
    super(`a notification was refused with ${String(details.length)} problem(s)`);
  }
}

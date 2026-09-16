import { DomainError } from '@domain/shared';
import type { ErrorDetail } from './error-catalogue';

/**
 * A payload the parser could not accept.
 *
 * It carries **every** invalid field, not the first one: returning them one at a time turns a
 * form with three mistakes into three round trips.
 */
export class InputValidationError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'common.error.invalidInput';

  constructor(readonly details: readonly ErrorDetail[]) {
    super(`invalid input in ${String(details.length)} field(s)`);
  }
}

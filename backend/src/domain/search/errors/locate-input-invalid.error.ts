import { DomainError } from '@domain/shared';

/** Which rule a field of a locate request broke. */
export type LocateInputRule = 'limitOutOfRange' | 'tooManyPrefer';

export interface LocateInputViolation {
  readonly field: string;
  readonly rule: LocateInputRule;
}

/** `limit` outside what the installation allows, or more than 50 `prefer` entries — S-60. */
export class LocateInputInvalidError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'search.error.locateInputInvalid';

  readonly details: readonly LocateInputViolation[];

  constructor(violations: readonly LocateInputViolation[]) {
    super(`the locate request is not well-formed: ${describe(violations)}`);
    this.details = violations;
  }
}

function describe(violations: readonly LocateInputViolation[]): string {
  return violations.map((violation) => `${violation.field}:${violation.rule}`).join(', ');
}

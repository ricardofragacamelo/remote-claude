import { DomainError } from '@domain/shared';

/** Which expectation a path inside the open folder broke. The client translates the rule. */
export type FilePathRule =
  | 'mustBeRelative'
  | 'mustNotContainNul'
  | 'mustNotContainBackslash'
  | 'mustNameAnEntry'
  | 'segmentTooLong'
  | 'mustNotHaveEmptySegment'
  | 'mustNotClimb'
  | 'mustNotUseReservedName'
  | 'mustBeUnique';

/** One field of the request and one rule it broke. */
export interface FilePathViolation {
  readonly field: string;
  readonly rule: FilePathRule;
}

/**
 * A path that is not a path inside the open folder at all — refused before the disk is touched.
 *
 * `INVALID_INPUT` and not `WORKSPACE_NOT_ALLOWED`: an absolute path or a backslash was never
 * refused by the fence, it was refused before the fence was consulted. It carries **every** rule
 * every field broke, so a form with three mistakes is one round trip, not three (plan 07, S-18).
 */
export class InvalidFilePathError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'files.error.invalidPath';

  readonly details: readonly FilePathViolation[];

  constructor(violations: readonly FilePathViolation[]) {
    super(`not a usable path inside the open folder: ${describe(violations)}`);
    this.details = violations;
  }
}

function describe(violations: readonly FilePathViolation[]): string {
  return violations.map((violation) => `${violation.field}:${violation.rule}`).join(', ');
}

import { DomainError } from '@domain/shared';

/** What about the apply call itself (not an item of the file) made it refused. */
export type ImportApplyProblem = 'digest' | 'index';

/**
 * The apply call does not match the preview it claims to: a `digest` that is not the file's own
 * (S-143), or an `accept`/`acknowledgeBroad` index outside the file's own items.
 */
export class PermissionRuleImportInvalidError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'permission.error.ruleImportInvalid';

  constructor(readonly problem: ImportApplyProblem) {
    super(`import apply refused: ${problem}`, { problem });
  }
}

import { DomainError } from '@domain/shared';

/** Which ceiling of the import file was crossed (plan 15, D-17). */
export type ImportSizeReason = 'rules' | 'bytes';

/**
 * The import file is over one of its two ceilings — 500 rules, 256 KB — checked before a single
 * byte of it is parsed as a rule.
 */
export class PermissionRuleImportTooLargeError extends DomainError {
  readonly code = 'PAYLOAD_TOO_LARGE';
  readonly messageKey = 'permission.error.ruleImportTooLarge';

  constructor(
    readonly reason: ImportSizeReason,
    readonly limit: number,
  ) {
    super(`the import file is over the ${reason} ceiling of ${String(limit)}`, { reason, limit });
  }
}

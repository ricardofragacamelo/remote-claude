import { DomainError } from '@domain/shared';

/** Why an import file was refused outright — before any item of it was looked at. */
export type ImportUnsupportedReason = 'format' | 'version' | 'malformed';

/**
 * The file `POST /permission-rules/import/preview` was given is not the plan 15 export format, or
 * is a version this installation does not read (plan 15, D-17).
 */
export class PermissionRuleImportUnsupportedError extends DomainError {
  readonly code = 'PERMISSION_RULE_IMPORT_UNSUPPORTED';
  readonly messageKey = 'permission.error.ruleImportUnsupported';

  constructor(readonly reason: ImportUnsupportedReason) {
    super(`the import file is not readable: ${reason}`, { reason });
  }
}

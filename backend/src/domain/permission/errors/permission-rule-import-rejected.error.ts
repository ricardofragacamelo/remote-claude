import { DomainError } from '@domain/shared';

/** One accepted import item that could not be written, after revalidation. */
export interface ImportRejection {
  readonly index: number;
  readonly code: string;
}

/**
 * One or more items `POST /permission-rules/import` was told to accept can no longer be created —
 * revalidated right before the write, and refused as a whole: a partial import would leave the
 * caller guessing which of the rules they reviewed actually exist (plan 15, D-17).
 *
 * `details` reuses the field/rule shape every validation error carries, the same way
 * {@link PermissionAnswersInvalidError} does: `field` names the rejected item by its index in the
 * file, `rule` is that item's own code.
 */
export class PermissionRuleImportRejectedError extends DomainError {
  readonly code = 'PERMISSION_RULE_IMPORT_REJECTED';
  readonly messageKey = 'permission.error.ruleImportRejected';
  readonly details: readonly { readonly field: string; readonly rule: string }[];

  constructor(readonly rejections: readonly ImportRejection[]) {
    super(
      `import rejected: ${rejections.map((rejection) => `#${String(rejection.index)}=${rejection.code}`).join(', ')}`,
    );
    this.details = rejections.map((rejection) => ({
      field: `rules[${String(rejection.index)}]`,
      rule: rejection.code,
    }));
  }
}

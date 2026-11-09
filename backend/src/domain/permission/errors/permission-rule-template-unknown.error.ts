import { DomainError } from '@domain/shared';

/**
 * A `templateId` the catalog does not have.
 *
 * Checked at grant time, for every route a rule is born from — not only applying a template
 * (plan 15, B-17, S-36): the field is free text on the wire, and a stale or invented id would
 * otherwise sit on the rule forever with no origin anyone can look up.
 */
export class PermissionRuleTemplateUnknownError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'permission.error.ruleTemplateUnknown';

  constructor(readonly templateId: string) {
    super(`template ${templateId} is not in the catalog`, { templateId });
  }
}

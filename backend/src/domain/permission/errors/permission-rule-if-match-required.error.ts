import { DomainError } from '@domain/shared';

/**
 * `PATCH /permission-rules/:ruleId` with no `If-Match` — `428`, the same code the files domain
 * answers with for the same reason (plan 07, D-03; plan 15, B-04 — one catalogue entry, reused):
 * the request is understood, and the server needs one more thing before it changes a resource two
 * clients could be reading at once.
 */
export class PermissionRuleIfMatchRequiredError extends DomainError {
  readonly code = 'PRECONDITION_REQUIRED';
  readonly messageKey = 'permission.error.ruleIfMatchRequired';

  constructor(readonly ruleId: string) {
    super(`rule ${ruleId} needs an If-Match before its validity can change`, { ruleId });
  }
}

import { DomainError } from '@domain/shared';

/**
 * The `If-Match` of `PATCH /permission-rules/:ruleId` is not the rule's current version — `412`.
 *
 * `currentEtag` lets the client re-fetch and decide, the same role it plays on a file
 * ([07 · D-03](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)).
 */
export class PermissionRuleChangedError extends DomainError {
  readonly code = 'PERMISSION_RULE_CHANGED';
  readonly messageKey = 'permission.error.ruleChanged';

  constructor(ruleId: string, currentEtag: string) {
    super(`rule ${ruleId} is not the version the request was made against`, { currentEtag });
  }
}

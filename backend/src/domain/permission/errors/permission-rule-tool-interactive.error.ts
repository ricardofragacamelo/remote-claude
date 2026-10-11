import { DomainError } from '@domain/shared';

/**
 * A rule for a call whose answer is the person's, not an authorisation.
 *
 * A `question` or a `plan` is the agent asking for a choice or for a plan to be read. A rule allowing
 * either would hand the model a question nobody answered or a plan nobody saw, and neither is a kind
 * a rule can name (plan 28, B-32), so no such rule is granted — from the rules API or from a card
 * ([24 · D-08, D-31](../../../../../docs/plans/24-structured-questions/decisions.md)).
 */
export class PermissionRuleToolInteractiveError extends DomainError {
  readonly code = 'PERMISSION_RULE_TOOL_INTERACTIVE';
  readonly messageKey = 'permission.error.ruleToolInteractive';

  constructor(kind: string) {
    super(`a rule cannot answer ${kind}, which asks the person`, { kind });
  }
}

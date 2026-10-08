import { DomainError } from '@domain/shared';

/**
 * A rule that would **allow** a tool whose answer is the person's, not an authorisation.
 *
 * `AskUserQuestion` and `ExitPlanMode` are Claude asking for a choice or for a plan to be read. A
 * rule allowing either would hand the model a question nobody answered or a plan nobody saw, so no
 * such rule is granted — from the rules API or from a card ([24 · D-08, D-31](../../../../../docs/plans/24-structured-questions/decisions.md)).
 * A `deny` is still granted: it is a legitimate way of saying "do not ask me anything here".
 */
export class PermissionRuleToolInteractiveError extends DomainError {
  readonly code = 'PERMISSION_RULE_TOOL_INTERACTIVE';
  readonly messageKey = 'permission.error.ruleToolInteractive';

  constructor(toolName: string) {
    super(`an allow rule cannot answer ${toolName}, which asks the person`, { toolName });
  }
}

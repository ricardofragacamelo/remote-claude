import { DomainError } from '@domain/shared';

/**
 * The pattern is not in the grammar of the Claude Code settings.
 *
 * Refused **at creation** rather than kept as a rule that never matches. The stored pattern is
 * literally what goes back to the SDK in `updatedPermissions`, so a malformed one is not a rule
 * that does nothing: it is two halves of the system disagreeing about which commands are covered
 * (docs/architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude).
 */
export class PermissionRulePatternInvalidError extends DomainError {
  readonly code = 'PERMISSION_RULE_PATTERN_INVALID';
  readonly messageKey = 'permission.error.rulePatternInvalid';

  constructor(pattern: string) {
    super(`permission rule pattern ${pattern} is outside the grammar`, { pattern });
  }
}

import { DomainError } from '@domain/shared';

/**
 * The pattern is not in the canonical grammar of a rule — `shell(git status:*)`, `file.edit(src/**)`,
 * `web.fetch(domain:example.com)`, `mcp(server:tool)`, a bare kind (plan 28, B-31).
 *
 * Refused **at creation**, with the reason, rather than kept as a rule that never matches: a
 * malformed pattern would simply never fire and look like a rule that was never granted. An
 * engine's own grammar is outside it too: the dialect of the engine only translates the past (docs/architecture/backend/03-modules.md, the `permission` module).
 */
export class PermissionRulePatternInvalidError extends DomainError {
  readonly code = 'PERMISSION_RULE_PATTERN_INVALID';
  readonly messageKey = 'permission.error.rulePatternInvalid';

  /**
   * @param reason why — `syntax`, `unknownKind`, `emptyMatcher`, `parenthesis`,
   *   `prefixOutsideShell`, `emptyPrefix`, `matcherNotAllowed`, `domainExpected`,
   *   `serverToolExpected`
   */
  constructor(pattern: string, reason: string) {
    super(`permission rule pattern ${pattern} is outside the grammar (${reason})`, {
      pattern,
      reason,
    });
  }
}

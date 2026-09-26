import { PermissionRuleNotFoundError, PermissionRuleNotOwnedError } from '@domain/permission';
import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * The rule with that id, provided it is the caller's.
 *
 * Written once because revoking a rule and opening it ask the same two questions in the same
 * order, and the copy that drifts is the one that forgets the second: a rule of somebody else's is
 * `403` and stays exactly as it was, and one that does not exist is `404`.
 *
 * @throws {PermissionRuleNotFoundError} no rule with that id
 * @throws {PermissionRuleNotOwnedError} somebody else's rule
 */
export async function ownedRule(
  rules: PermissionRuleRepository,
  userId: UserId,
  ruleId: string,
): Promise<PermissionRule> {
  const rule = await rules.findById(ruleId);

  if (rule === null) {
    throw new PermissionRuleNotFoundError(ruleId);
  }

  if (!rule.userId.equals(userId)) {
    throw new PermissionRuleNotOwnedError(ruleId);
  }

  return rule;
}

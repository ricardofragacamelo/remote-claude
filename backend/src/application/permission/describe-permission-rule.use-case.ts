import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type { ListedPermissionRule } from './list-permission-rules.use-case';
import { ownedRule } from './owned-rule';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * One rule, in whatever state it is in — active, expired, or revoked.
 *
 * It is how the trail leads to the rule that answered: somebody finds a command that ran without
 * being asked, and opens the authorisation behind it. That has to work **after** the rule was taken
 * back too, and then the answer says so rather than being a `404` with no reason
 * ([D-18](../../../../docs/plans/03-rules-and-audit/decisions.md)). The listing leaves the revoked
 * rule out on purpose; this does not.
 */
export class DescribePermissionRuleUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} no rule with that id
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} somebody else's rule
   */
  async execute(userId: UserId, ruleId: string): Promise<ListedPermissionRule> {
    const rule = await ownedRule(this.rules, userId, ruleId);

    return { rule, status: rule.statusAt(this.clock.now()) };
  }
}

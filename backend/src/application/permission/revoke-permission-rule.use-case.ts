import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { RevokePermissionRulesUseCase } from './revoke-permission-rules.use-case';

/**
 * Taking one rule back — the batch of one
 * ([15 · D-06](../../../../docs/plans/15-rules-management/decisions.md#d-06--revogar-em-lote-atômico-ou-por-item)):
 * `DELETE /permission-rules/:ruleId` and `POST /permission-rules/revoke` share this one
 * implementation, so neither is the copy that quietly stops matching the other.
 */
export class RevokePermissionRuleUseCase {
  constructor(private readonly batch: RevokePermissionRulesUseCase) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} no rule with that id
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} somebody else's rule — which
   *   stays exactly as it was
   */
  async execute(userId: UserId, ruleId: string): Promise<PermissionRule> {
    const [rule] = await this.batch.execute(userId, [ruleId]);

    // A lot of exactly one id always comes back with exactly one rule — `execute` throws before
    // this line otherwise.
    return rule as PermissionRule;
  }
}

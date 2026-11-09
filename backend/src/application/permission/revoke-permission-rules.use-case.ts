import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { Clock, IdGenerator } from '@domain/shared';
import type { RecordAuditEventUseCase } from '@application/audit';
import { ownedRule } from './owned-rule';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * Taking several rules back in one call — atomic in both halves
 * ([15 · D-06](../../../../docs/plans/15-rules-management/decisions.md#d-06--revogar-em-lote-atômico-ou-por-item)):
 * every id is checked before anything is written (`404`/`403` leave nothing touched), and the write
 * itself is **one** instruction, idempotent per id the same way revoking a single rule already is —
 * one already revoked simply comes back unchanged, never an error for the rest of the lot.
 *
 * `DELETE /permission-rules/:ruleId` is the batch of one, through {@link
 * import('./revoke-permission-rule.use-case').RevokePermissionRuleUseCase} — the single call and
 * the lot share this one implementation rather than two that age differently.
 */
export class RevokePermissionRulesUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly trail: RecordAuditEventUseCase,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} any id does not exist
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} any id is somebody else's —
   *   neither this throws until **every** id has been checked, so a lot with one bad id revokes
   *   nothing at all
   */
  async execute(userId: UserId, ruleIds: readonly string[]): Promise<PermissionRule[]> {
    for (const ruleId of ruleIds) {
      await ownedRule(this.rules, userId, ruleId);
    }

    const at = this.clock.now();
    const batchId = this.ids.next();
    const results = await this.rules.saveRevocations(ruleIds, at);

    for (const result of results) {
      if (!result.revoked) {
        continue;
      }

      await this.trail.execute({
        userId,
        kind: 'permission.ruleRevoked',
        subjectId: result.rule.id,
        subjectLabel: result.rule.ruleContent,
        details: { batchId },
        at,
      });
    }

    return results.map((result) => result.rule);
  }
}

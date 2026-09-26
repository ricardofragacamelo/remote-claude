import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type { RecordAuditEventUseCase } from '@application/audit';
import { ownedRule } from './owned-rule';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * Taking a rule back, with effect on the very next request.
 *
 * Nothing has to be told about it, and that is by design: the rules are read on every request and
 * never cached, so a session that is already running asks again the next time — which is the
 * whole promise of revoking. A rule that kept applying until a restart would not be revoked.
 *
 * **Twice is once.** The domain hands back the same rule when it was already revoked; then nothing
 * is written and nothing is recorded, and the caller gets the revoked rule either way (S-55).
 *
 * **At the same moment is once, too.** Two clients revoking together both read the rule as active,
 * so the domain cannot tell — only the store can. The one whose write it keeps is the revocation
 * and is recorded; the other records nothing and answers with the winner's instant, so both ends
 * are told the same rule (S-46).
 */
export class RevokePermissionRuleUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly trail: RecordAuditEventUseCase,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} no rule with that id
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} somebody else's rule — which
   *   stays exactly as it was
   */
  async execute(userId: UserId, ruleId: string): Promise<PermissionRule> {
    const rule = await ownedRule(this.rules, userId, ruleId);
    const at = this.clock.now();
    const revoked = rule.revoke(at);

    if (revoked === rule) {
      return rule;
    }

    const stored = await this.rules.saveRevocation(revoked);

    if (!stored.revoked) {
      return stored.rule;
    }

    await this.trail.execute({
      userId,
      kind: 'permission.ruleRevoked',
      subjectId: revoked.id,
      subjectLabel: revoked.ruleContent,
      at,
    });

    return stored.rule;
  }
}

import type { DisclosedAuditPage, QueryAuditTrailUseCase } from '@application/audit';
import type { UserId } from '@domain/auth';
import { ownedRule } from './owned-rule';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * The invocations a rule answered — "14 usos" opens to these same 14 lines ([15 · B-11], S-62).
 *
 * Through `QueryAuditTrailUseCase`, never a raw `AuditTrailReader.page()` of this module's own:
 * that use case is what discloses a `file.read` without its content (S-61) — a second
 * implementation of the same redaction is the one that drifts.
 */
export class ListRuleInvocationsUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly trail: QueryAuditTrailUseCase,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} no rule with that id
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} somebody else's rule
   */
  async execute(
    userId: UserId,
    ruleId: string,
    cursor: number | null,
    limit: number,
  ): Promise<DisclosedAuditPage> {
    await ownedRule(this.rules, userId, ruleId);

    return this.trail.execute({
      userId,
      sessionId: null,
      toolName: null,
      decision: null,
      from: null,
      to: null,
      before: cursor,
      ruleId,
      limit,
    });
  }
}

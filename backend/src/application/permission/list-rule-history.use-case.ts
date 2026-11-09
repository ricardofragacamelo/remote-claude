import type { AuditEventPage, AuditEventReader } from '@application/audit';
import type { UserId } from '@domain/auth';
import { ownedRule } from './owned-rule';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * The events of one rule — granted, validity changed, revoked, restored ([15 · B-11]).
 *
 * Read through `AuditEventReader`, by `subjectId`, scoped to the caller — `permission` never reads
 * `audit_events` any other way.
 */
export class ListRuleHistoryUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly events: AuditEventReader,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} no rule with that id
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} somebody else's rule
   */
  async execute(userId: UserId, ruleId: string): Promise<AuditEventPage> {
    await ownedRule(this.rules, userId, ruleId);

    return this.events.page({
      userId,
      kindPrefix: null,
      subjectId: ruleId,
      before: null,
      limit: 100,
    });
  }
}

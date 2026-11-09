import {
  PermissionRuleRestoreWindowClosedError,
  PermissionRuleStateConflictError,
  isPersistedPermissionScope,
} from '@domain/permission';
import type { Clock } from '@domain/shared';
import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { GrantPermissionRuleCommand } from './commands/grant-permission-rule.command';
import type { GrantPermissionRuleUseCase } from './grant-permission-rule.use-case';
import { ownedRule } from './owned-rule';
import type { PermissionSettings } from './permission-settings';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * Undoing a revocation, for several rules at once
 * ([15 · D-11](../../../../docs/plans/15-rules-management/decisions.md#d-11--desfazer-a-revogação)).
 *
 * "Restore" is not its own kind of write: it is the **same** granting routine every other rule is
 * born from, with the pattern, scope, decision and original validity read off the revoked rule, and
 * `grantedVia: 'restore'` naming where it came from. Breadth and the lifetime ceiling are conferred
 * again, exactly as any other route a rule is born from confers them (S-90) — a rule that would be
 * refused today does not come back by restoring it. Calling it twice on the same revoked rule hands
 * back the one rule both times, because the grant routine is already idempotent between active
 * rules (S-91).
 */
export class RestorePermissionRulesUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly grant: GrantPermissionRuleUseCase,
    private readonly clock: Clock,
    private readonly settings: PermissionSettings,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} any id does not exist
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} any id is somebody else's
   * @throws {PermissionRuleStateConflictError} any id is not `revoked` — active, expired, or a
   *   `disabled` rule the migration switched off, which never comes back this way either (S-226)
   * @throws {PermissionRuleRestoreWindowClosedError} the undo window has closed for any id — the
   *   path from there is duplicating the rule through the assistant, with its own second step
   * @throws {import('@domain/permission').PermissionRuleTooBroadError} the rule would be refused as
   *   too broad today (S-90)
   * @throws {import('@domain/permission').PermissionRuleExpiryInvalidError} its own validity has, in
   *   the meantime, passed (S-92)
   */
  async execute(userId: UserId, ruleIds: readonly string[]): Promise<PermissionRule[]> {
    const now = this.clock.now();
    const revoked: PermissionRule[] = [];

    for (const ruleId of ruleIds) {
      revoked.push(await this.revokedWithinWindow(userId, ruleId, now));
    }

    return this.grant.executeAll(revoked.map((rule) => this.restoreCommand(userId, rule)));
  }

  /** Every check before anything is granted — all of them, before any id's rule is restored. */
  private async revokedWithinWindow(
    userId: UserId,
    ruleId: string,
    now: Date,
  ): Promise<PermissionRule> {
    const rule = await ownedRule(this.rules, userId, ruleId);
    const status = rule.statusAt(now);
    const revokedAt = rule.revokedAt;

    if (status !== 'revoked' || revokedAt === null) {
      throw new PermissionRuleStateConflictError(ruleId, status);
    }

    if (now.getTime() - revokedAt.getTime() > this.settings.ruleRestoreWindowMs) {
      throw new PermissionRuleRestoreWindowClosedError(ruleId);
    }

    return rule;
  }

  /** The revoked rule, asked for again — the grant routine decides whether it still may exist. */
  private restoreCommand(userId: UserId, rule: PermissionRule): GrantPermissionRuleCommand {
    if (!isPersistedPermissionScope(rule.scope)) {
      // A `session` rule never reaches `PermissionRuleRepository` — it lives in the registry and
      // dies with its session — so `ownedRule` here never hands one back. Asserted, not guessed.
      throw new Error(`restore read a ${rule.scope} rule from the repository: ${rule.id}`);
    }

    return {
      userId,
      pattern: rule.ruleContent,
      engine: rule.engine,
      decision: rule.decision,
      scope: rule.scope,
      projectPath: rule.scope === 'project' ? { trusted: rule.projectPath as string } : null,
      expiresAt: rule.expiresAt,
      // Restoring is a one-click undo (D-11): the breadth check still runs, but asks nothing of the
      // caller — `unbounded` is refused all the same, whatever this says.
      acknowledgeBroad: true,
      grantedVia: 'restore',
      restoredFrom: rule.id,
    };
  }
}

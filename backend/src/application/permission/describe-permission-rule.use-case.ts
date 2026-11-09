import { retentionCutoff } from '@domain/audit';
import type { AuditTrailReader, RuleUsage } from '@application/audit';
import { analyzeRules } from '@domain/permission';
import type { PermissionRule, RuleFinding } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import { expiryCeilingFor } from './expiry-ceiling';
import { folderReachableFor } from './folder-reachable';
import type { ListedPermissionRuleItem } from './list-permission-rules.use-case';
import { ownedRule } from './owned-rule';
import type { PermissionSettings } from './permission-settings';
import { toAnalyzable } from './rule-analysis-adapter';
import {
  EMPTY_PERMISSION_RULE_FILTER,
  type PermissionRuleRepository,
} from './ports/permission-rule.repository';
import type { RuleFolderResolver } from './ports/rule-folder-resolver.port';

/** One rule, described in full — everything a listed rule already has (B-10, B-15): its usage, its
 * folder's reach and its findings, never only the bare rule and its status (plan 15, B-22). */
export type DescribedPermissionRule = ListedPermissionRuleItem;

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
    private readonly folders: RuleFolderResolver,
    private readonly trail: AuditTrailReader,
    private readonly retentionDays: number,
    private readonly settings: PermissionSettings,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} no rule with that id
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} somebody else's rule
   */
  async execute(userId: UserId, ruleId: string): Promise<DescribedPermissionRule> {
    const rule = await ownedRule(this.rules, userId, ruleId);
    const now = this.clock.now();

    return {
      rule,
      status: rule.statusAt(now),
      findings: rule.isActiveAt(now) ? await this.findingsFor(rule, userId) : [],
      usage: rule.disabledReason === null ? await this.usageFor(rule, userId, now) : null,
      folderReachable: folderReachableFor(rule, userId, this.folders),
      expiryCeiling: expiryCeilingFor(rule, this.settings, now),
    };
  }

  private async usageFor(rule: PermissionRule, userId: UserId, now: Date): Promise<RuleUsage> {
    const usage = await this.trail.usageOf(
      userId,
      [rule.id],
      retentionCutoff(now, this.retentionDays),
    );

    return usage.get(rule.id) ?? { count: 0, lastUsedAt: null };
  }

  /** Against the caller's whole active set — the same analysis the listing runs (B-15). */
  private async findingsFor(rule: PermissionRule, userId: UserId): Promise<readonly RuleFinding[]> {
    const active = await this.rules.listAllMatching(userId, {
      ...EMPTY_PERMISSION_RULE_FILTER,
      status: ['active'],
    });

    return (
      analyzeRules(active.map((activeRule) => toAnalyzable(activeRule, this.folders, userId))).get(
        rule.id,
      ) ?? []
    );
  }
}

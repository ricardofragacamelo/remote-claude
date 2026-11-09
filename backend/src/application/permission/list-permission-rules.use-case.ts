import { retentionCutoff } from '@domain/audit';
import type { AuditTrailReader, RuleUsage } from '@application/audit';
import { analyzeRules } from '@domain/permission';
import type { PermissionRule, PermissionRuleStatus, RuleFinding } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import { folderReachableFor } from './folder-reachable';
import { expiryCeilingFor } from './expiry-ceiling';
import { toAnalyzable } from './rule-analysis-adapter';
import type { RuleFolderResolver } from './ports/rule-folder-resolver.port';
import type { PermissionSettings } from './permission-settings';
import {
  EMPTY_PERMISSION_RULE_FILTER,
  type PermissionRuleCursor,
  type PermissionRuleListFilter,
  type PermissionRuleRepository,
  type PermissionRuleSortField,
  type PermissionRuleSortOrder,
} from './ports/permission-rule.repository';

/** One rule, with where it stands at the moment it was listed. */
export interface ListedPermissionRule {
  readonly rule: PermissionRule;
  readonly status: PermissionRuleStatus;
}

/** A listed rule, with what the rules management screen adds (plan 15, B-10). */
export interface ListedPermissionRuleItem extends ListedPermissionRule {
  /** `null` on a `disabled` rule, which has no canonical pattern the trail answered with. */
  readonly usage: RuleUsage | null;

  /** Whether a `project` rule's folder is still in the caller's allowlist — `null` for `always`. */
  readonly folderReachable: boolean | null;

  /** How far an extension may reach, counted from this read — `null` on a `disabled` rule (plan 15, B-22, B-23). */
  readonly expiryCeiling: Date | null;

  /** What the redundancy/overlap/conflict analysis says about this rule (plan 15, B-15). */
  readonly findings: readonly RuleFinding[];
}

export interface SearchPermissionRulesQuery {
  readonly userId: UserId;
  readonly filter: PermissionRuleListFilter;
  readonly sort: PermissionRuleSortField;
  readonly order: PermissionRuleSortOrder;
  /** Decoded by the caller — a malformed `cursor` is a `400` before this use case is ever asked. */
  readonly cursor: PermissionRuleCursor | null;
  readonly pageSize: number;
}

export interface PermissionRuleSearchResult {
  readonly items: readonly ListedPermissionRuleItem[];
  readonly nextCursor: string | null;
}

const USAGE_SORTS: readonly PermissionRuleSortField[] = ['lastUsedAt', 'useCount'];

/**
 * The rules a person has granted and not taken back.
 *
 * Expired ones are **in** the list, marked: "it is gone" and "it stopped applying" are different
 * answers to somebody asking what they authorised. Revoked ones are not — revoking is the act of
 * removing it from here. Only the caller's own, always.
 */
export class ListPermissionRulesUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly clock: Clock,
    private readonly trail: AuditTrailReader,
    private readonly folders: RuleFolderResolver,
    private readonly retentionDays: number,
    private readonly settings: PermissionSettings,
  ) {}

  /** @deprecated kept for the internal callers that still want "everything, unpaginated". */
  async execute(userId: UserId): Promise<ListedPermissionRule[]> {
    const now = this.clock.now();

    return (await this.rules.listFor(userId)).map((rule) => ({
      rule,
      status: rule.statusAt(now),
    }));
  }

  /**
   * One page, filtered and sorted — the rules management screen's listing ([15 · B-10]).
   *
   * `lastUsedAt`/`useCount` cannot be sorted by the repository, which does not read the trail
   * ([backend/03 · fronteiras](../../../../docs/architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem)):
   * for those two, every matching rule is read once, usage is asked of `AuditTrailReader`, and the
   * sort happens here — a single page, for now (`nextCursor` is always `null` on this path; asking
   * for a second page of a usage sort is not yet supported).
   */
  async search(query: SearchPermissionRulesQuery): Promise<PermissionRuleSearchResult> {
    const now = this.clock.now();
    const page = USAGE_SORTS.includes(query.sort)
      ? await this.usageSortedPage(query, now)
      : await this.sqlSortedPage(query, now);

    return {
      items: await this.withExtras(page.items, query.userId, now),
      nextCursor: page.nextCursor,
    };
  }

  private async sqlSortedPage(
    query: SearchPermissionRulesQuery,
    now: Date,
  ): Promise<{ items: readonly PermissionRule[]; nextCursor: string | null }> {
    return this.rules.listPage({
      userId: query.userId,
      filter: query.filter,
      sort: query.sort,
      order: query.order,
      cursor: query.cursor,
      pageSize: query.pageSize,
      now,
    });
  }

  private async usageSortedPage(
    query: SearchPermissionRulesQuery,
    now: Date,
  ): Promise<{ items: readonly PermissionRule[]; nextCursor: string | null }> {
    const candidates = await this.rules.listAllMatching(query.userId, query.filter);
    const usage = await this.trail.usageOf(
      query.userId,
      candidates.map((rule) => rule.id),
      retentionCutoff(now, this.retentionDays),
    );
    const direction = query.order === 'asc' ? 1 : -1;

    const sorted = [...candidates].sort((a, b) => {
      const primary =
        (usageKeyOf(a, usage, query.sort) - usageKeyOf(b, usage, query.sort)) * direction;

      return primary !== 0 ? primary : b.createdAt.getTime() - a.createdAt.getTime();
    });

    return { items: sorted.slice(0, query.pageSize), nextCursor: null };
  }

  private async withExtras(
    items: readonly PermissionRule[],
    userId: UserId,
    now: Date,
  ): Promise<ListedPermissionRuleItem[]> {
    const canonical = items.filter((rule) => rule.disabledReason === null);
    const usage = await this.trail.usageOf(
      userId,
      canonical.map((rule) => rule.id),
      retentionCutoff(now, this.retentionDays),
    );
    const findings = await this.findingsOf(userId);

    return items.map((rule) => ({
      rule,
      status: rule.statusAt(now),
      usage:
        rule.disabledReason === null
          ? (usage.get(rule.id) ?? { count: 0, lastUsedAt: null })
          : null,
      folderReachable: folderReachableFor(rule, userId, this.folders),
      expiryCeiling: expiryCeilingFor(rule, this.settings, now),
      findings: findings.get(rule.id) ?? [],
    }));
  }

  /**
   * Every active rule's findings, against the **whole** active set of the caller — never only the
   * page a screen has loaded, which could not see a redundancy with a rule two pages away.
   */
  private async findingsOf(userId: UserId): Promise<ReadonlyMap<string, readonly RuleFinding[]>> {
    const active = await this.rules.listAllMatching(userId, {
      ...EMPTY_PERMISSION_RULE_FILTER,
      status: ['active'],
    });

    return analyzeRules(active.map((rule) => toAnalyzable(rule, this.folders, userId)));
  }
}

function usageKeyOf(
  rule: PermissionRule,
  usage: ReadonlyMap<string, RuleUsage>,
  sort: PermissionRuleSortField,
): number {
  const found = usage.get(rule.id);

  if (sort === 'useCount') {
    return found?.count ?? 0;
  }

  return found?.lastUsedAt?.getTime() ?? 0;
}

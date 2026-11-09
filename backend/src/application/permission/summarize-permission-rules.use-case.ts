import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type {
  PermissionRuleListFilter,
  PermissionRuleRepository,
} from './ports/permission-rule.repository';
import type { PermissionRuleSummary } from './ports/permission-rule.repository';

/**
 * Counts over the caller's rules, for the tabs and the navigation badge ([15 · B-10]) — the same
 * predicate the listing reads, never a second implementation of it.
 */
export class SummarizePermissionRulesUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, filter: PermissionRuleListFilter): Promise<PermissionRuleSummary> {
    return this.rules.summarize(userId, filter, this.clock.now());
  }
}

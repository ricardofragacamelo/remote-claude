import type { PermissionRule, PermissionRuleStatus } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/** One rule, with where it stands at the moment it was listed. */
export interface ListedPermissionRule {
  readonly rule: PermissionRule;
  readonly status: PermissionRuleStatus;
}

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
  ) {}

  async execute(userId: UserId): Promise<ListedPermissionRule[]> {
    const now = this.clock.now();

    return (await this.rules.listFor(userId)).map((rule) => ({
      rule,
      status: rule.statusAt(now),
    }));
  }
}

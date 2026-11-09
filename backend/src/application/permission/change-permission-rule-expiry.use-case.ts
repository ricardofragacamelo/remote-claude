import {
  PermissionRuleChangedError,
  PermissionRuleIfMatchRequiredError,
  PermissionRuleStateConflictError,
  ruleEtag,
} from '@domain/permission';
import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type { RecordAuditEventUseCase } from '@application/audit';
import { ownedRule } from './owned-rule';
import type { PermissionSettings } from './permission-settings';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * Shortening or extending a rule's validity — the **only** thing about it this product ever edits
 * under its own id ([15 · D-01](../../../../docs/plans/15-rules-management/decisions.md#d-01--o-que-se-edita-numa-regra)).
 * A different pattern, scope or decision is a new rule: the trail points at a rule by id, and "this
 * id answered the request" has to keep meaning what it meant the day it did.
 *
 * The refusals have a fixed order ([15 · B-03](../../../../docs/plans/15-rules-management/F1-rules-backend.md#b-03--contrato-das-rotas-de-escrita-de-teste-e-de-simulação)),
 * because each answers a different question and the first one that applies is the honest one:
 * existence, ownership, the precondition header, the rule's own state — "the rule was revoked" says
 * more than "the rule changed" (S-70) —, the version, and only then the new value itself.
 */
export class ChangePermissionRuleExpiryUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly trail: RecordAuditEventUseCase,
    private readonly clock: Clock,
    private readonly settings: PermissionSettings,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} no rule with that id
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} somebody else's rule
   * @throws {PermissionRuleIfMatchRequiredError} no `If-Match` sent
   * @throws {PermissionRuleStateConflictError} the rule is not `active` — revoked, expired, or a
   *   `disabled` one the migration switched off, which never comes back by a `PATCH` (S-226)
   * @throws {PermissionRuleChangedError} `If-Match` is not the rule's current version
   * @throws {import('@domain/permission').PermissionRuleExpiryInvalidError} the new validity is not
   *   in the future
   * @throws {import('@domain/permission').PermissionRuleExpiryTooLongError} it outlives the ceiling,
   *   counted from now ([15 · D-14](../../../../docs/plans/15-rules-management/decisions.md#d-14--o-teto-da-extensão-conta-de-quando))
   */
  async execute(
    userId: UserId,
    ruleId: string,
    expiresAt: Date,
    ifMatch: string | null,
  ): Promise<PermissionRule> {
    const rule = await ownedRule(this.rules, userId, ruleId);

    if (ifMatch === null) {
      throw new PermissionRuleIfMatchRequiredError(ruleId);
    }

    const now = this.clock.now();
    const status = rule.statusAt(now);

    if (status !== 'active') {
      throw new PermissionRuleStateConflictError(ruleId, status);
    }

    const currentEtag = ruleEtag(rule);

    if (ifMatch !== currentEtag) {
      throw new PermissionRuleChangedError(ruleId, currentEtag);
    }

    // The domain validates the new value last, and may hand back the same instance — the same
    // validity sent again writes nothing and records nothing (S-73).
    const updated = rule.withExpiry(expiresAt, now, this.maxLifetimeMs(rule));

    if (updated === rule) {
      return rule;
    }

    return this.write(rule, updated, userId, now);
  }

  /**
   * The write decides a race with a revocation or another `PATCH`, never an earlier read
   * (S-74, S-75): a rule that moved since [rule] was read comes back from the repository exactly as
   * it now stands, and this method re-asks the same two questions — state, then version — of it.
   */
  private async write(
    rule: PermissionRule,
    updated: PermissionRule,
    userId: UserId,
    now: Date,
  ): Promise<PermissionRule> {
    const extending = updated.expiresAt.getTime() > rule.expiresAt.getTime();
    const result = await this.rules.changeExpiry(
      rule.id,
      rule.expiresAt,
      updated.expiresAt,
      extending,
    );

    if (!result.changed) {
      const raceStatus = result.rule.statusAt(now);

      if (raceStatus !== 'active') {
        throw new PermissionRuleStateConflictError(rule.id, raceStatus);
      }

      throw new PermissionRuleChangedError(rule.id, ruleEtag(result.rule));
    }

    try {
      await this.trail.execute({
        userId,
        kind: 'permission.ruleExpiryChanged',
        subjectId: rule.id,
        subjectLabel: rule.ruleContent,
        details: { from: rule.expiresAt.toISOString(), to: result.rule.expiresAt.toISOString() },
        at: now,
      });
    } catch (error) {
      if (extending) {
        // An extension the trail cannot account for is undone — the direction an authorisation
        // given in advance may never fail silently toward (same policy as granting, D-01).
        await this.rules.changeExpiry(rule.id, result.rule.expiresAt, rule.expiresAt, false);
      }
      // A shortening stays — the safer direction, the same policy as revoking — and the call still
      // fails, so the caller knows the trail did not record it.
      throw error;
    }

    return result.rule;
  }

  private maxLifetimeMs(rule: PermissionRule): number {
    return rule.decision === 'deny'
      ? this.settings.ruleDenyMaxLifetimeMs
      : this.settings.ruleMaxLifetimeMs;
  }
}

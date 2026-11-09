import type { PermissionRule } from '@domain/permission';
import type { PermissionSettings } from './permission-settings';

/**
 * How far `PATCH /permission-rules/:ruleId` may extend this rule's validity, counted from [now]
 * ([15 · D-14](../../../../docs/plans/15-rules-management/decisions.md#d-14--o-teto-da-extensão-conta-de-quando))
 * — `deny` living longer than `allow` ([15 · D-04](../../../../docs/plans/15-rules-management/decisions.md#d-04--deny-sem-validade)).
 *
 * `null` on a `disabled` rule, which answers nothing and has no validity to extend — shared by the
 * listing and the single-rule read so the two never drift, the same shape as `folderReachableFor`
 * (B-22).
 */
export function expiryCeilingFor(
  rule: PermissionRule,
  settings: PermissionSettings,
  now: Date,
): Date | null {
  if (rule.disabledReason !== null) {
    return null;
  }

  const maxLifetimeMs =
    rule.decision === 'deny' ? settings.ruleDenyMaxLifetimeMs : settings.ruleMaxLifetimeMs;

  return new Date(now.getTime() + maxLifetimeMs);
}

import { DomainError } from '@domain/shared';

/** How wide a pattern reaches (plan 15, D-09) — `narrow` never refuses, `deny` never refuses. */
export type PermissionRuleBreadth = 'narrow' | 'broad' | 'unbounded';

/**
 * An `allow` whose pattern reaches further than its breadth may, on any route that grants one —
 * `POST`, import, restore, or a template (plan 15, D-09).
 *
 * `unbounded` is refused outright; `broad` is refused only without `acknowledgeBroad: true`. A
 * `deny` is never too broad: blocking wide is never less safe.
 */
export class PermissionRuleTooBroadError extends DomainError {
  readonly code = 'PERMISSION_RULE_TOO_BROAD';
  readonly messageKey = 'permission.error.ruleTooBroad';

  constructor(readonly breadth: PermissionRuleBreadth) {
    super(`an allow rule of breadth ${breadth} needs acknowledgement, or is refused outright`, {
      breadth,
    });
  }
}

import type { TFunction } from 'i18next';

import type { PermissionRule } from '../types/rule';

/** How a rule came to exist, in words — `grantedVia` is `null` for a rule granted before this
 * column existed (plan 15, B-07): "origin not recorded", never a guess. */
export function ruleOrigin(rule: PermissionRule, locale: string, t: TFunction): string {
  const at = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(rule.grantedAt),
  );

  return t(`permission.ruleOrigin.${rule.grantedVia ?? 'notRecorded'}`, {
    who: rule.grantedBy,
    at,
  });
}

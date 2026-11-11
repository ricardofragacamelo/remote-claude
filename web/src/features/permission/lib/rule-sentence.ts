import type { TFunction } from 'i18next';
import type { PermissionRuleReach } from '@remote-claude/contracts';

import { kindShortName } from '@/shared/lib/tool-label';
import type { PermissionRule } from '../types/rule';

/**
 * What a rule does, as one sentence — built from the server's own `reach` (S-163), never from a
 * reparsed pattern: the matcher's form, its content and whether it excludes a chained command are
 * exactly what `describeReach` already computed, and this only arranges them into words.
 *
 * A disabled rule has no `reach` to read from (plan 28, D-18) and no sentence of its own — the
 * screen shows why it was disabled instead, never a sentence that would misdescribe it.
 */
export function ruleSentence(rule: PermissionRule, locale: string, t: TFunction): string | null {
  if (rule.reach == null) {
    return null;
  }

  const action = actionText(rule.reach, rule.kind, t);
  const scope = scopeText(rule, t);
  const until = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(rule.expiresAt),
  );
  const key =
    rule.decision === 'allow' ? 'permission.ruleSentence.allow' : 'permission.ruleSentence.deny';

  return t(key, { action, scope, until });
}

/**
 * What a reach does, in words — the kind named by its short name, never raw. Exported for the
 * rule-authoring wizard's own live preview (plan 15, B-27, S-185): a draft has a `reach` before it
 * has a scope or a validity, so it reads this alone, never the whole sentence below.
 */
export function actionText(
  reach: PermissionRuleReach,
  ruleKind: string | null,
  t: TFunction,
): string {
  const kind = kindShortName(ruleKind, t);

  if (reach.form === 'any') {
    return t('permission.ruleSentence.actionAny', { kind });
  }

  // `content` is `null` only on `form: 'any'` (the server's own guarantee) — already past here.
  if (reach.form === 'exact') {
    return t('permission.ruleSentence.actionExact', { content: reach.content! });
  }

  return t(
    reach.excludesCompound
      ? 'permission.ruleSentence.actionPrefixExcludesCompound'
      : 'permission.ruleSentence.actionPrefix',
    { content: reach.content! },
  );
}

/**
 * Where the rule reaches, in words. `always` is every folder; `project` is the one folder named —
 * and its subfolders, since D-10 widened a `project` rule's reach to them (a revision of this
 * plan's own text, which this sentence follows, not the older "not the subfolders" example).
 *
 * Exported for the wizard's own review step (B-27): a draft has a scope and a folder before it has
 * an id, a decision sentence or an expiry.
 */
export function scopeText(
  rule: Pick<PermissionRule, 'scope' | 'projectPath'>,
  t: TFunction,
): string {
  if (rule.scope === 'always') {
    return t('permission.ruleSentence.scopeAlways');
  }

  return t('permission.ruleSentence.scopeProject', { folder: rule.projectPath ?? '' });
}

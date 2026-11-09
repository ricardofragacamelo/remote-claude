import type { TFunction } from 'i18next';
import type { AuditTrailEntry } from '@remote-claude/contracts';

import { kindShortName } from '@/shared/lib/tool-label';

/** What one invocation row says: the tool kind, and when (B-22). */
export function ruleInvocationLabel(
  invocation: AuditTrailEntry,
  locale: string,
  t: TFunction,
): string {
  const at = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(invocation.at),
  );

  return `${kindShortName(invocation.kind, t)} · ${at}`;
}

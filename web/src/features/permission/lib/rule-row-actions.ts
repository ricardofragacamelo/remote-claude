import { Eye, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { PermissionRule } from '../types/rule';

/** The DOM id of a rule's row — what a keyboard focus of its own names with `aria-activedescendant`
 * (S-168), rather than the browser's own tab order. */
export function ruleRowElementId(ruleId: string): string {
  return `rule-row-${ruleId}`;
}

/** One thing a row's context menu offers — the same shape the selection bar and the palette will
 * grow into using (B-24), so a label, an icon or a shortcut never drifts between them. */
export interface RuleRowAction {
  readonly id: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  available(): boolean;
  run(): void;
}

export interface RuleRowActionHandlers {
  onOpen(ruleId: string): void;
  onRevoke(ruleId: string): void;
}

/**
 * What one row's `⋯` offers today (S-161): opening the detail, and revoking while there is
 * something to take back. Duplicar, Testar and Exportar are a later task's rows to add to this same
 * list (B-22, B-29, B-30) — never a second list, so the row, the toolbar and the palette keep
 * agreeing once they exist.
 */
export function ruleRowActions(
  rule: PermissionRule,
  handlers: RuleRowActionHandlers,
  /** While a mutation of this rule is already in flight — the menu's own second guard, beside the
   * hook's own (S-19): a second click here must find revoking already offered as unavailable. */
  busy = false,
): readonly RuleRowAction[] {
  return [
    {
      id: 'rules.open',
      labelKey: 'rules.action.open',
      icon: Eye,
      available: () => true,
      run: () => {
        handlers.onOpen(rule.id);
      },
    },
    {
      id: 'rules.revoke',
      labelKey: 'rules.action.revoke',
      icon: Undo2,
      available: () => !busy && rule.status !== 'revoked' && rule.status !== 'disabled',
      run: () => {
        handlers.onRevoke(rule.id);
      },
    },
  ];
}

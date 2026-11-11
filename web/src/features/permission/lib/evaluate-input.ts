import type { PermissionDecision } from '../types/permission';
import type { EvaluateRuleInput } from '../types/rule';
import type { NewRuleKind } from './rule-kind-fields';
import { hasSubject, subjectOf } from './evaluate-subject';

/** The modes the command tester offers (plan 15, B-28) — `allowAll` is never one of them: there is
 * nothing to test under it, every kind already answers without asking (D-12). */
export const TESTABLE_MODES = ['ask', 'readOnly', 'acceptEdits'] as const;
export type TestableMode = (typeof TESTABLE_MODES)[number];

/** The rule being authored, as the wizard's own review step hands it to the tester (S-198) — it
 * counts as if it already existed, alongside whatever the caller already has (D-12). */
export interface DraftRuleHandoff {
  readonly pattern: string;
  readonly decision: PermissionDecision;
  readonly engine?: string;
}

/** Everything the command-test panel's own fields hold, before they become a request. */
export interface CommandTestDraft {
  readonly kind: NewRuleKind | null;
  readonly value: string;
  readonly mcpTool?: string;
  readonly folder?: string;
  readonly mode?: TestableMode;
  readonly draft?: DraftRuleHandoff;
}

/**
 * `null` while there is nothing worth testing yet: no kind chosen, or a kind whose subject field is
 * still empty (S-196).
 */
export function evaluationInputOf(draft: CommandTestDraft): EvaluateRuleInput | null {
  if (draft.kind === null || !hasSubject(draft.kind, draft.value)) {
    return null;
  }

  return {
    kind: draft.kind,
    subject: subjectOf(draft.kind, draft.value, draft.mcpTool),
    ...(draft.folder === undefined ? {} : { folder: draft.folder }),
    ...(draft.mode === undefined ? {} : { mode: draft.mode }),
    ...(draft.draft === undefined ? {} : { draft: draft.draft }),
  };
}

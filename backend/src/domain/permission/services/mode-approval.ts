import type { PermissionMode } from '@domain/session';

/**
 * The tools that are put to a person whatever the mode.
 *
 * They are not permissions: they are Claude asking for an answer — a choice among options, a plan
 * to approve. Approving one on the person's behalf would hand the model a question nobody answered
 * ([23 · D-05](../../../../../docs/plans/23-fluid-permissions/decisions.md)).
 */
export const HUMAN_ONLY_TOOLS: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode']);

/**
 * Whether the mode alone answers an invocation that no rule answered.
 *
 * Only Permitir tudo does, and never for a question. It is asked **after** the rules, so a `deny`
 * still refuses and an `allow` still answers as a rule
 * ([ADR-022](../../../../../docs/architecture/shared/00-decisions.md)).
 */
export function answeredByMode(mode: PermissionMode, toolName: string): boolean {
  return mode === 'allowAll' && !HUMAN_ONLY_TOOLS.has(toolName);
}

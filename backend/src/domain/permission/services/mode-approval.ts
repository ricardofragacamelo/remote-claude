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

/**
 * Whether a rule of this decision may answer an invocation of this tool.
 *
 * A `deny` always may: "do not ask me anything here" is a legitimate thing to say. An `allow` may
 * not answer a question or a plan — it would hand Claude an answer nobody gave, or approve a plan
 * nobody read ([24 · D-08](../../../../../docs/plans/24-structured-questions/decisions.md)).
 */
export function answeredByRule(decision: 'allow' | 'deny', toolName: string): boolean {
  return decision === 'deny' || !HUMAN_ONLY_TOOLS.has(toolName);
}

import type { ToolKind } from '@domain/engine';
import type { PermissionMode } from '@domain/session';

/**
 * The kinds that are put to a person whatever the mode.
 *
 * They are not permissions: they are the agent asking for an answer — a choice among options, a
 * plan to approve. Approving one on the person's behalf would hand the model a question nobody
 * answered ([23 · D-05](../../../../../docs/plans/23-fluid-permissions/decisions.md)); by kind, so a
 * question of any engine is one (plan 28, B-20).
 */
export const HUMAN_ONLY_KINDS: ReadonlySet<ToolKind> = new Set(['question', 'plan']);

/**
 * Whether the mode alone answers an invocation that no rule answered.
 *
 * Only Permitir tudo does, and never for a question. It is asked **after** the rules, so a `deny`
 * still refuses and an `allow` still answers as a rule
 * ([ADR-022](../../../../../docs/architecture/shared/00-decisions.md)).
 */
export function answeredByMode(mode: PermissionMode, kind: ToolKind): boolean {
  return mode === 'allowAll' && !HUMAN_ONLY_KINDS.has(kind);
}

/**
 * Whether a rule of this decision may answer an invocation of this kind.
 *
 * A `deny` always may: "do not ask me anything here" is a legitimate thing to say. An `allow` may
 * not answer a question or a plan — it would hand the agent an answer nobody gave, or approve a plan
 * nobody read ([24 · D-08](../../../../../docs/plans/24-structured-questions/decisions.md)).
 */
export function answeredByRule(decision: 'allow' | 'deny', kind: ToolKind): boolean {
  return decision === 'deny' || !HUMAN_ONLY_KINDS.has(kind);
}

/**
 * The kinds a read-only session refuses before any rule is read (plan 28, B-26): every write of a
 * file and every shell — a command line can change anything. The engine's own read-only mode is the
 * second layer; this one is ours, and holds whatever the engine thinks.
 */
export const READ_ONLY_REFUSED_KINDS: ReadonlySet<ToolKind> = new Set([
  'file.edit',
  'file.write',
  'file.delete',
  'file.move',
  'shell',
]);

/** Whether the mode alone refuses an invocation of this kind — a change, in a read-only session. */
export function refusedByMode(mode: PermissionMode, kind: ToolKind): boolean {
  return mode === 'readOnly' && READ_ONLY_REFUSED_KINDS.has(kind);
}

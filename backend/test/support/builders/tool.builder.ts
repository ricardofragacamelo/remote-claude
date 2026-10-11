import { classifyTool } from '@adapter/outbound/engines/claude/tool-classifier';
import { ToolClassifiers } from '@application/engine';
import type { CanonicalTool } from '@domain/engine';

/**
 * A call of Claude Code as the core reads it, classified by the real classifier of the engine — so a
 * test that needs a `tool` gets exactly what the adapter would build from the same name and input,
 * and never a hand-made one that quietly drifts from it (plan 28, B-14).
 *
 * @param folder the session's folder, which the label's paths are relative to — `''` unknown
 */
export function claudeTool(
  name: string,
  input: Readonly<Record<string, unknown>> = {},
  folder = '',
): CanonicalTool {
  return classifyTool(name, input, folder);
}

/** The classifiers of the core with Claude's as the only, and default, one — as the composition wires it. */
export function claudeClassifiers(): ToolClassifiers {
  return new ToolClassifiers([{ engine: 'claude', classify: classifyTool }], 'claude');
}

/**
 * A call as the core reads it, made by hand — for an engine that has no classifier here (the test
 * engine of S-131) or a kind no classifier builds. Only what a rule reads: the kind, the subject and
 * the engine.
 */
export function canonicalTool(
  kind: string,
  subject: CanonicalTool['subject'] = {},
  engine = 'claude',
): CanonicalTool {
  return {
    kind,
    label: { messageKey: 'sessions.tool.other', params: {} },
    subject,
    changes: [],
    origin: { engine, native: kind },
  };
}

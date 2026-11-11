import type { NewRuleKind } from './rule-kind-fields';
import { subjectFieldOf } from './rule-kind-fields';

/**
 * The real, concrete subject of an invocation to test — never a pattern (plan 15, B-28). Unlike
 * the wizard's own {@link patternOf}, which writes a grammar the matcher reads, this writes the
 * literal `toolSubjectSchema` fields a real call would carry, reusing the same per-kind field
 * `subjectFieldOf` already picks for the pattern step (S-196): `command` for `shell`, `paths` for
 * a `file.*` kind, `url` for `web.fetch`, `server`/`tool` for `mcp`, and nothing at all for a kind
 * the grammar never narrows by subject (`search`, `web.search`, `agent` — D-09's own `broad`).
 */
export function subjectOf(
  kind: NewRuleKind,
  value: string,
  mcpTool?: string,
): Readonly<Record<string, unknown>> {
  const trimmed = value.trim();

  if (trimmed === '') {
    return {};
  }

  switch (subjectFieldOf(kind)) {
    case 'command':
      return { command: trimmed };
    case 'path':
      return { paths: [trimmed] };
    case 'domain':
      return { url: trimmed };
    case 'mcp':
      return mcpSubjectOf(trimmed, mcpTool);
    case 'none':
      return {};
  }
}

function mcpSubjectOf(server: string, mcpTool?: string): Readonly<Record<string, unknown>> {
  const tool = mcpTool?.trim();
  return tool === undefined || tool === '' ? { server } : { server, tool };
}

/** Whether this kind's subject is filled in enough to test — `none` needs nothing (S-196). */
export function hasSubject(kind: NewRuleKind, value: string): boolean {
  return subjectFieldOf(kind) === 'none' || value.trim() !== '';
}

import { NEW_RULE_KINDS, allowsPrefix } from './rule-kind-fields';
import type { NewRuleKind } from './rule-kind-fields';

/** How the pattern step's draft reaches (plan 15, B-27, S-185) — `any` needs no subject text at
 * all; `exact`/`prefix` read it from `subject`. `prefix` only ever applies to `shell` (D-08). */
export type NewRuleForm = 'any' | 'exact' | 'prefix';

export interface NewRulePatternDraft {
  readonly kind: NewRuleKind;
  readonly form: NewRuleForm;

  /** The command, path or domain the grammar reads — ignored when `form` is `any`. */
  readonly subject: string;

  /** `mcp` only: the tool of `subject`'s server — empty reaches the whole server (`mcp(server:*)`,
   * never a bare `mcp(server)`, which the grammar would read as an exact tool named `server`). */
  readonly mcpTool?: string;
}

/**
 * The canonical pattern this draft writes — never reinterpreted once typed by a person, only ever
 * built here, from the three fields the pattern step owns (D-20's own grammar: `kind`,
 * `kind(subject)`, `kind(subject:*)`). `mcp` writes `mcp(server:tool)` or `mcp(server:*)`, never
 * the bare kind (D-09: a server-less `mcp` is `unbounded`, and the wizard never offers it in the
 * first place).
 */
export function patternOf(draft: NewRulePatternDraft): string {
  const subject = draft.subject.trim();

  if (draft.kind === 'mcp') {
    const tool = draft.mcpTool?.trim();
    return `mcp(${subject}:${tool === undefined || tool === '' ? '*' : tool})`;
  }

  if (draft.form === 'any' || subject === '') {
    return draft.kind;
  }

  return draft.form === 'prefix' ? `${draft.kind}(${subject}:*)` : `${draft.kind}(${subject})`;
}

/** The kind an existing, stored pattern starts with — a canonical pattern always does (D-20),
 * so "duplicar" (B-30) can tell which one without being handed it separately. `null` for a
 * pattern naming none of this wizard's own kinds (an engine-restricted or pre-dialect pattern,
 * never offered for duplication in the first place — B-02's own `disabled` state, S-01). */
export function kindOfPattern(pattern: string): NewRuleKind | null {
  return NEW_RULE_KINDS.find((kind) => pattern === kind || pattern.startsWith(`${kind}(`)) ?? null;
}

/**
 * The inverse of {@link patternOf} — "duplicar" (B-30, D-01) hands a stored rule's own pattern to
 * the wizard pre-filled, editable from there same as if it had been typed. This un-templates the
 * exact three shapes `patternOf` itself ever writes; it does not parse the grammar at large (that
 * stays the domain's own job, never the web's — the same caution B-22's and B-28's own notes give
 * for matching and width). `null` for a pattern outside those three shapes — a glob, a compound
 * `shell`, or anything else this wizard's own steps never offered in the first place — and the
 * caller falls back to a blank pattern step rather than a wrong one.
 */
export function draftFromPattern(
  pattern: string,
  kind: NewRuleKind,
): Omit<NewRulePatternDraft, 'kind'> | null {
  if (pattern === kind) {
    return { form: 'any', subject: '' };
  }

  const opensWith = `${kind}(`;
  if (!pattern.startsWith(opensWith) || !pattern.endsWith(')')) {
    return null;
  }

  const inner = pattern.slice(opensWith.length, -1);

  if (kind === 'mcp') {
    const colon = inner.indexOf(':');
    if (colon === -1) {
      return null;
    }
    const tool = inner.slice(colon + 1);
    return { form: 'exact', subject: inner.slice(0, colon), mcpTool: tool === '*' ? '' : tool };
  }

  if (allowsPrefix(kind) && inner.endsWith(':*')) {
    return { form: 'prefix', subject: inner.slice(0, -2) };
  }

  return { form: 'exact', subject: inner };
}

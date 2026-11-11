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
 * The canonical pattern this draft writes — never reinterpreted once typed, only ever built here,
 * from the three fields the pattern step owns (D-20's own grammar: `kind`, `kind(subject)`,
 * `kind(subject:*)`). `mcp` writes `mcp(server:tool)` or `mcp(server:*)`, never the bare kind
 * (D-09: a server-less `mcp` is `unbounded`, and the wizard never offers it in the first place).
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

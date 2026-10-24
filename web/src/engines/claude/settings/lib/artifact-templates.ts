/**
 * The initial content of every file this screen can create — English, frontmatter of the kind the
 * CLI documents, a short body a person edits next (plan 13, D-18: "modelo inicial no web, em
 * inglês, com o frontmatter de cada tipo").
 */

/** `.claude/commands/<name>.md` — B-33. `allowed-tools` stays commented: it narrows what the slash
 * command may use, but never dispenses this product's own approval (D-18, D-21). */
export function commandTemplate(name: string): string {
  return `---
description: What "/${name}" does
argument-hint: "[argument]"
# allowed-tools: Read, Grep
# allowed-tools narrows what this command may use when it runs — it never skips the approval this
# product already asks for every tool call.
---

Describe what "/${name}" should do here. Use $ARGUMENTS for what was typed after the command's name.
`;
}

/** `.claude/agents/<name>.md` — B-36. `name:` is required explicitly (D-102): a subagent file without
 * it never appears in the catalog, with no error. `permissionMode`, broad `tools`, or `mcpServers`
 * here would widen what this subagent may do, flagged wherever this product lists it (S-175). */
export function agentTemplate(name: string): string {
  return `---
name: ${name}
description: When this subagent should be used
# model: sonnet
# tools: Read, Grep, Glob
# permissionMode: default
---

Describe this subagent's own instructions here — what it should do, and how.
`;
}

/** `.claude/output-styles/<name>.md` — B-37. */
export function outputStyleTemplate(name: string): string {
  return `---
name: ${name}
description: What this output style changes about how Claude answers
---

Describe the style here — the tone, the structure, what it should emphasize or avoid.
`;
}

/** `.claude/skills/<name>/SKILL.md` — B-34, S-159. The warning about \`!\` blocks is D-21's: they run
 * outside this product's own approval, in every session that loads this skill. */
export function skillTemplate(name: string): string {
  return `---
name: ${name}
description: When this skill should be used
---

Describe this skill here — what it does, and when Claude should reach for it.

A line starting with "!" runs as shell, outside this product's own tool approval, in every session
that loads this skill — never put a command there that should ask first.
`;
}

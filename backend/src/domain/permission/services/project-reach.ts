/**
 * Whether a `project` rule's folder reaches a call made from [subjectPath]: the folder itself, or a
 * folder inside it, at a `/` boundary — never a sibling that merely shares the text as a prefix
 * (`/raiz/app` never reaches `/raiz/app2`), and never a parent above it (`/raiz/app` never reaches
 * `/raiz`).
 *
 * [15 · D-10](../../../../../docs/plans/15-rules-management/decisions.md#d-10--project-alcança-as-subpastas),
 * decided 2026-11-05 against the plan's original recommendation of exact equality: every `project`
 * rule granted before this change now reaches further than it did, by the same rule, for everyone.
 *
 * Pure string comparison on paths already normalised by `WorkspacePath` — the same form a session
 * carries, and the same form a rule is granted with (S-29). No file system, no glob: a subpath is a
 * segment away, never a pattern.
 */
export function projectPathReaches(rulePath: string, subjectPath: string): boolean {
  return rulePath === subjectPath || subjectPath.startsWith(`${rulePath}/`);
}

/**
 * Shapes [replacement] to the case [matched] was typed in — the VS Code "preserve case" (`AB`)
 * toggle. `foo` → `bar` becomes `bar`, `Bar` or `BAR` for `foo`, `Foo` or `FOO`; a match whose
 * case is neither — mixed, or with no letters at all — leaves [replacement] exactly as typed
 * (S-43). Pure post-processing of text already substituted; it never touches which text matched.
 */
export function preserveCase(matched: string, replacement: string): string {
  if (!/[a-z]/i.test(matched)) {
    return replacement;
  }

  if (matched === matched.toUpperCase() && matched !== matched.toLowerCase()) {
    return replacement.toUpperCase();
  }

  if (matched === matched.toLowerCase() && matched !== matched.toUpperCase()) {
    return replacement.toLowerCase();
  }

  if (/^[A-Z][a-z]*$/.test(matched)) {
    return replacement.length === 0
      ? replacement
      : replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }

  return replacement;
}

/** What Quick Open makes of what was typed — a file search, or a request forwarded to the editor. */
export type QuickOpenInput =
  | { readonly kind: 'goToLine' }
  | { readonly kind: 'search'; readonly query: string; readonly line: number | null };

const FILE_AND_LINE = /^(.+):(\d+)$/;
const BARE_LINE = /^:\d*$/;

/**
 * `file.ts:42` searches for `file.ts`, to open at line 42; `:42` alone — nothing before the colon,
 * digits or none yet — is the editor's own "go to line" (plan 07), which Quick Open forwards to
 * rather than reimplementing (B-14, S-107). Anything else is the search text, as typed.
 */
export function quickOpenInputOf(raw: string): QuickOpenInput {
  if (BARE_LINE.test(raw)) {
    return { kind: 'goToLine' };
  }

  const match = FILE_AND_LINE.exec(raw);
  if (match === null) {
    return { kind: 'search', query: raw, line: null };
  }

  // The regex above already guarantees two non-optional groups — never undefined once it matches.
  const path = match[1]!;
  const lineText = match[2]!;
  return { kind: 'search', query: path, line: Number(lineText) };
}

/**
 * What this domain knows about a shell line — one list, read by both the risk classifier and the
 * rule matcher, so the two can never disagree about what joins one command to the next.
 *
 * It is deliberately not a parser. Quotes are not understood: `git commit -m "a; b"` counts as
 * having a separator. Every place that reads these fails **closed** on that — a question more,
 * never an authorisation more — which is the only safe way to be wrong without a parser.
 */

/** The tools whose input is a shell line. */
export const SHELL_TOOLS: ReadonlySet<string> = new Set(['Bash', 'BashTool']);

/**
 * What separates one command from the next in a single line: `&&`, `||`, `;`, `|`, `&` and a line
 * break. The two-character operators come first so `&&` is never read as two `&`.
 */
export const SHELL_SEPARATORS = /&&|\|\||[;|&\n]/;

/**
 * Syntax that can turn any line into any other: substitution (`` ` ``, `$(`), process
 * substitution and redirection (`<(`, `>(`, `>`, `>>`, `<`), heredoc and an escaped line break.
 */
export const SHELL_OPAQUE = /[><`]|\$\(|<<|\\\n/;

/**
 * Where a line can be cut to find the commands inside it — the separators, plus the edges of a
 * substitution, so `echo $(rm -rf x)` yields `rm -rf x` as one of its pieces.
 */
const SEGMENT_BOUNDARIES = /&&|\|\||\$\(|[;|&\n`()<>]/;

/** Whether the line joins, substitutes or redirects anything — whether it is more than one command. */
export function hasShellOperator(command: string): boolean {
  return SHELL_SEPARATORS.test(command) || SHELL_OPAQUE.test(command);
}

/**
 * The commands a line may run, cut at every operator and trimmed; the empty pieces are dropped.
 *
 * It over-cuts on purpose: it is read by the side that refuses, and a refusal that looks at more
 * pieces than the shell would run only ever refuses more.
 */
export function shellSegments(command: string): string[] {
  return command
    .split(SEGMENT_BOUNDARIES)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

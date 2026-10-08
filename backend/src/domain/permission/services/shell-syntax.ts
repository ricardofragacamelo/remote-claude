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

/**
 * Redirections that change nothing about what runs: a file descriptor sent to another (`2>&1`,
 * `>&2`) and output thrown away (`>/dev/null`, `2> /dev/null`, `&>/dev/null`). Only when the target
 * ends there — `> /dev/null/../x` is not thrown away, and stays opaque.
 */
const NEUTRAL_REDIRECTIONS = /(?:&>|\d?>)\s*\/dev\/null(?=\s|$|[;&|])|\d?>&\d(?=\s|$|[;&|])/g;

/** A piece of a line whose quotes all close. Odd quotes mean the cut fell inside a quoted text. */
function quotesClose(piece: string): boolean {
  const count = (quote: string): number => piece.split(quote).length - 1;

  return count('"') % 2 === 0 && count("'") % 2 === 0;
}

/**
 * The commands a line runs, for the side that **allows** — or `null` when it cannot be read safely.
 *
 * The opposite reading of {@link shellSegments}, and on purpose: that one over-cuts because it
 * refuses, this one gives up because it authorises
 * ([23 · D-07](../../../../../docs/plans/23-fluid-permissions/decisions.md)):
 *
 * 1. the redirections that change nothing are taken out first;
 * 2. anything opaque left — substitution, a real redirection, a heredoc — gives up;
 * 3. the line is cut at its separators;
 * 4. with more than one piece, a piece with an unclosed quote or a backslash gives up: the cut may
 *    have fallen inside a quoted text, and the piece would not be a command the shell runs.
 */
export function commandsOf(line: string): string[] | null {
  const neutral = line.replace(NEUTRAL_REDIRECTIONS, ' ');

  if (SHELL_OPAQUE.test(neutral)) {
    return null;
  }

  const pieces = neutral
    .split(new RegExp(SHELL_SEPARATORS.source, 'g'))
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);

  if (pieces.length === 0) {
    return null;
  }

  if (pieces.length > 1 && pieces.some((piece) => !quotesClose(piece) || piece.includes('\\'))) {
    return null;
  }

  return pieces;
}

/**
 * What the person is completing at the cursor of the composer — an `@` mention or a `/` command —
 * read off the text, purely (plan 08, B-48, B-50).
 */

/** An `@` that opens the menu: at the start, or after blank space, up to the cursor. */
const MENTION_AT_CURSOR = /(?:^|\s)@[^\s@]*$/u;

/** A `/` that opens the menu: the very start of the prompt, with no blank space up to the cursor. */
const COMMAND_AT_CURSOR = /^\/\S*$/u;

/** What is being completed, where it starts in the text and what was typed of it. */
export type Completion =
  | { readonly kind: 'mention'; readonly start: number; readonly query: string }
  | { readonly kind: 'command'; readonly start: number; readonly query: string };

/** What the text up to `cursor` is completing, or `null`. */
export function completionAt(text: string, cursor: number): Completion | null {
  const before = text.slice(0, cursor);
  const command = COMMAND_AT_CURSOR.exec(before);

  if (command !== null) {
    return { kind: 'command', start: 0, query: before.slice(1) };
  }

  if (!MENTION_AT_CURSOR.test(before)) {
    return null;
  }

  // What follows the last `@` — the expression made sure it holds neither blank space nor `@`.
  const start = before.lastIndexOf('@');
  return { kind: 'mention', start, query: before.slice(start + 1) };
}

/** The text with what is being completed replaced by `replacement`, and where the cursor goes. */
export function replaceCompletion(
  text: string,
  cursor: number,
  completion: Completion,
  replacement: string,
): { readonly text: string; readonly cursor: number } {
  const before = text.slice(0, completion.start);
  const after = text.slice(cursor);

  return { text: `${before}${replacement}${after}`, cursor: before.length + replacement.length };
}

/** Where an `@` query points: the folder to list, and what to look for in it. */
export interface MentionTarget {
  /** Relative to the folder of the tab; `''` is the folder itself. */
  readonly directory: string;
  readonly partial: string;

  /** Out of the folder — `..` or an absolute path —, which is never offered (S-230). */
  readonly outside: boolean;
}

/** What an `@` query names: `src/comp` lists `src` and looks for `comp` in it. */
export function mentionTarget(query: string): MentionTarget {
  const slash = query.lastIndexOf('/');
  const directory = slash === -1 ? '' : query.slice(0, slash);
  const outside = query.startsWith('/') || query.split('/').includes('..');

  return { directory, partial: query.slice(slash + 1), outside };
}

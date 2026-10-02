/**
 * How the context of a prompt reaches Claude — plan 08, D-01, B-44 and B-45.
 *
 * A file, a folder or a range of lines is a **reference**: a delimited line naming the path, which
 * Claude reads through `Read` under the `PreToolUse` hook, so the trail sees the reading. What is
 * not on disk — a text file dropped from the desktop, the text a provider of the client holds —
 * travels itself, delimited and labelled by where it came from, never as if the person had typed it.
 * An image goes beside the text as a block of its own, and is not composed here.
 *
 * Composed in the backend, so the web and the app send the same thing and Claude reads the same
 * thing whichever sent it. Pure: strings in, a string out.
 */

/** A file, a folder or a range of one, inside the session's folder — what Claude reads by `Read`. */
export interface PromptReference {
  readonly kind: 'file' | 'folder';

  /** Relative to the session's folder, POSIX — the folder itself is `.`. */
  readonly path: string;

  /** The lines of a file the prompt is about, inclusive, from 1 — `null` for all of it. */
  readonly lines: { readonly start: number; readonly end: number } | null;
}

/** Text that is not on disk, labelled by where it came from. */
export interface PromptText {
  /** `upload` for a file the person dropped from the desktop; a provider of the client otherwise. */
  readonly source: string;

  /** The name of the dropped file, or what the provider calls the text ("terminal: bash"). */
  readonly label: string;
  readonly content: string;
}

/** An image the person attached, as the Messages API takes it. */
export interface PromptImage {
  readonly mediaType: string;

  /** The bytes, in base64. */
  readonly data: string;
}

/**
 * What the log of the edge says about one item of the context: its kind, the path or the name, the
 * size and — for an upload — the hash. **Never** what it holds (S-204, S-211).
 */
export interface ContextFact {
  readonly kind: 'file' | 'folder' | 'upload' | 'text';
  readonly path?: string;
  readonly lines?: string;
  readonly mediaType?: string;
  readonly bytes?: number;
  readonly sha256?: string;
}

/** What goes to Claude beside the text of a turn. */
export interface PromptExtras {
  /** What the person typed, before anything was composed — the only part the log may quote. */
  readonly typed: string;
  readonly images: readonly PromptImage[];
  readonly context: readonly ContextFact[];
}

/**
 * Where the CLI expands `@` into the contents of a file, with no `Read` and no hook: at the start of
 * the text, or after blank space or the full stop, comma, question mark and exclamation mark of CJK
 * text — read off the CLI 2.1.277 itself (discovery §10.1).
 */
const EXPANDED_MENTION = /(^|[\s。、？！])@/gu;

/**
 * The character put before such an `@`: `WORD JOINER`, which has no width, is not blank space to a
 * regular expression and so stops the match, and changes nothing a person or the model reads.
 */
export const MENTION_GUARD = '⁠';

/**
 * The text with every `@` the CLI would expand guarded — plan 08, B-44, R-10.
 *
 * A mention typed by hand, or pasted, would otherwise be read by the CLI before the model and the
 * trail ever saw it; guarded, it is a name in the text, and the model reads the file — if it wants
 * to — through `Read`, which the hook records. An `@` inside a word (`a@b.com`) is not one the CLI
 * expands, and stays as it is.
 */
export function guardMentions(text: string): string {
  return text.replace(EXPANDED_MENTION, (_match, before: string) => `${before}${MENTION_GUARD}@`);
}

/** A value inside a double-quoted attribute: nothing in it can close the quote or open a tag. */
function attribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** The line of one reference — the form the spike saw become a `Read` under the hook (D-01). */
export function referenceLine(reference: PromptReference): string {
  const kind = reference.kind === 'folder' ? ' kind="folder"' : '';
  const lines =
    reference.lines === null
      ? ''
      : ` lines="${String(reference.lines.start)}-${String(reference.lines.end)}"`;

  return `<reference path="${attribute(reference.path)}"${kind}${lines} />`;
}

/**
 * One delimited block of text. A closing tag inside the content is broken, so what was dropped
 * cannot end its own block and pass for something else.
 */
export function textBlock(text: PromptText): string {
  const content = text.content.replaceAll('</context>', '<\\/context>');

  return `<context source="${attribute(text.source)}" label="${attribute(text.label)}">\n${content}\n</context>`;
}

/**
 * The text of a turn as Claude receives it: what was typed, with its mentions guarded, then the
 * references and the blocks of text, each on its own, in the order they were chosen.
 */
export function composePrompt(
  typed: string,
  references: readonly PromptReference[],
  texts: readonly PromptText[],
): string {
  const parts = [...references.map(referenceLine), ...texts.map(textBlock)];
  const guarded = guardMentions(typed);

  if (parts.length === 0) {
    return guarded;
  }

  // The context alone is a prompt too: what was chosen, with nothing typed before it.
  return guarded.trim() === '' ? parts.join('\n') : `${guarded}\n\n${parts.join('\n')}`;
}

import type { Hunk, HunkLine } from '@/shared/lib/diff-hunk';

/** The tools whose card previews the change before it is approved (plan 08, B-29). */
export const PREVIEWED_TOOLS: ReadonlySet<string> = new Set(['Edit', 'MultiEdit', 'Write']);

/** How many unchanged lines a preview shows around a change. */
const CONTEXT = 3;

/** The file as it is on disk now, as far as the preview needs it. */
export type DiskNow =
  { readonly kind: 'text'; readonly content: string } | { readonly kind: 'absent' };

/** What the card can say of the change before it happens. */
export type EditPreview =
  | { readonly kind: 'hunks'; readonly hunks: readonly Hunk[] }
  /** An edit whose text is not in the file now — or is there more than once, unasked. */
  | { readonly kind: 'noMatch'; readonly edit: number; readonly reason: 'missing' | 'ambiguous' };

/** One replacement an edit asks for. */
interface Replacement {
  readonly from: string;
  readonly to: string;
  readonly all: boolean;
}

/** The absolute path a previewed tool writes, or `null` — a relative one names no file we know. */
export function writtenPath({ file_path: path }: Readonly<Record<string, unknown>>): string | null {
  return typeof path === 'string' && path.startsWith('/') ? path : null;
}

/**
 * The change a pending `Edit`, `MultiEdit` or `Write` would make, against the file **now** — computed
 * here, from the input of the question and the disk, without changing the question (D-03).
 *
 * An edit whose text is not in the file says so, and nothing is invented in its place (S-129): the
 * CLI would refuse it the same way.
 */
export function previewOf(
  toolName: string,
  input: Readonly<Record<string, unknown>>,
  disk: DiskNow,
): EditPreview {
  const now = disk.kind === 'text' ? disk.content : '';

  if (toolName === 'Write') {
    const content = typeof input['content'] === 'string' ? input['content'] : '';
    const hunk = wholeChange(now, content);
    return { kind: 'hunks', hunks: hunk === null ? [] : [hunk] };
  }

  return editedPreview(now, replacementsOf(toolName, input));
}

/** The hunks of edits applied one after the other, each against what the one before it left. */
function editedPreview(now: string, edits: readonly Replacement[]): EditPreview {
  let text = now;
  const hunks: Hunk[] = [];

  for (const [index, edit] of edits.entries()) {
    const at = occurrences(text, edit.from);
    const refused = refusalOf(at, edit);

    if (refused !== null) {
      return { kind: 'noMatch', edit: index, reason: refused };
    }

    for (const position of edit.all ? at : at.slice(0, 1)) {
      hunks.push(localChange(text, position, edit, `${String(index)}:${String(position)}`));
    }
    text = edit.all ? text.split(edit.from).join(edit.to) : replaceAt(text, at[0] ?? 0, edit);
  }

  return { kind: 'hunks', hunks };
}

/** Why the CLI would refuse an edit — its text missing, or found twice unasked — or `null`. */
function refusalOf(at: readonly number[], edit: Replacement): 'missing' | 'ambiguous' | null {
  if (at.length === 0) {
    return 'missing';
  }

  return at.length > 1 && !edit.all ? 'ambiguous' : null;
}

function replacementsOf(toolName: string, input: Readonly<Record<string, unknown>>): Replacement[] {
  const one = (edit: Readonly<Record<string, unknown>>): Replacement => ({
    from: typeof edit['old_string'] === 'string' ? edit['old_string'] : '',
    to: typeof edit['new_string'] === 'string' ? edit['new_string'] : '',
    all: edit['replace_all'] === true,
  });

  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(input['edits']) ? input['edits'] : [];
    return edits.flatMap((edit) =>
      typeof edit === 'object' && edit !== null
        ? [one(edit as Readonly<Record<string, unknown>>)]
        : [],
    );
  }

  return [one(input)];
}

/** Where `needle` starts in `text`, every time. */
function occurrences(text: string, needle: string): number[] {
  const found: number[] = [];

  for (
    let at = text.indexOf(needle);
    needle !== '' && at !== -1;
    at = text.indexOf(needle, at + needle.length)
  ) {
    found.push(at);
  }

  return found;
}

function replaceAt(text: string, position: number, edit: Replacement): string {
  return text.slice(0, position) + edit.to + text.slice(position + edit.from.length);
}

/** The lines of a text, each without its break. A final break opens no empty line. */
function linesOf(text: string): string[] {
  if (text === '') {
    return [];
  }

  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.slice(0, -1) : lines;
}

const as =
  (kind: HunkLine['kind']) =>
  (text: string): HunkLine => ({ kind, text: text.replace(/\r$/, '') });

/** The lines an edit at `position` touches, before and after, with a little around them. */
function localChange(text: string, position: number, edit: Replacement, id: string): Hunk {
  const start = text.lastIndexOf('\n', position - 1) + 1;
  const endBreak = text.indexOf('\n', position + edit.from.length);
  const end = endBreak === -1 ? text.length : endBreak;
  const before = linesOf(text.slice(0, start));
  const after = linesOf(text.slice(end + 1));
  const leading = before.slice(-CONTEXT);
  const removed = text.slice(start, end).split('\n');
  const added = replaceAt(text.slice(start, end), position - start, edit).split('\n');

  return {
    id,
    oldStart: before.length - leading.length + 1,
    newStart: before.length - leading.length + 1,
    lines: [
      ...leading.map(as('context')),
      ...removed.map(as('removed')),
      ...added.map(as('added')),
      ...after.slice(0, CONTEXT).map(as('context')),
    ],
  };
}

/** A whole file replaced: what is the same at its start and end stays context, the rest changes. */
function wholeChange(before: string, after: string): Hunk | null {
  const old = linesOf(before);
  const next = linesOf(after);

  if (before === after) {
    return null;
  }

  let head = 0;
  while (head < old.length && head < next.length && old[head] === next[head]) head += 1;

  let tail = 0;
  while (
    tail < old.length - head &&
    tail < next.length - head &&
    old[old.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail += 1;
  }

  const from = Math.max(0, head - CONTEXT);

  return {
    id: 'write',
    oldStart: from + 1,
    newStart: from + 1,
    lines: [
      ...old.slice(from, head).map(as('context')),
      ...old.slice(head, old.length - tail).map(as('removed')),
      ...next.slice(head, next.length - tail).map(as('added')),
      ...old.slice(old.length - tail, old.length - tail + CONTEXT).map(as('context')),
    ],
  };
}

/** A file of the folder a text names, and the line it points at. */
export interface FileLink {
  /** Relative to the folder of the tab. */
  readonly path: string;
  readonly line: number | null;
}

/**
 * What reads as a path to a file in a text: segments of name characters joined by `/`, ending in a
 * name with an extension, with an optional `:line` (and `:column`). A word with a slash and no
 * extension — "and/or", "a/b" — is prose, not a file (S-70).
 */
const PATH =
  /(?:\/|\.{1,2}\/)?(?:[\w@.+-]+\/)*[\w@+-][\w@.+-]*\.[A-Za-z0-9]{1,10}(?::\d+(?::\d+)?)?/g;

/** The pattern of one whole path, for a text that is nothing else — inline code. */
const WHOLE = new RegExp(`^${PATH.source}$`);

/**
 * The file a path of a text names, **inside** the folder of the tab — or `null` (B-16).
 *
 * A relative path is the folder's; an absolute one is only when it starts with the folder. Anything
 * that climbs out (`..`), a URL, or a path to somewhere else stays text: only the folder's files are
 * opened from the panel, through the files API of plan 07, which fences them again.
 */
export function fileLinkOf(text: string, folder: string): FileLink | null {
  if (text.includes('://') || !WHOLE.test(text)) {
    return null;
  }

  const [rawPath = '', line] = text.split(':');
  const relative = rawPath.startsWith('/')
    ? insideFolder(rawPath, folder)
    : rawPath.replace(/^\.\//, '');

  if (relative === null || relative === '' || relative.split('/').includes('..')) {
    return null;
  }

  return { path: relative, line: line === undefined ? null : Number(line) };
}

/** An absolute path, relative to the folder — `null` when it is not inside it. */
function insideFolder(path: string, folder: string): string | null {
  return path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : null;
}

/** One run of a text: words, or a file of the folder. */
export type TextPiece = { readonly text: string; readonly link: FileLink | null };

/** A text, cut where it names a file of the folder — the rest stays as it was. */
export function fileLinksIn(text: string, folder: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let from = 0;

  for (const match of text.matchAll(PATH)) {
    const link = urlAround(text, match.index) ? null : fileLinkOf(match[0], folder);

    if (link !== null) {
      pieces.push({ text: text.slice(from, match.index), link: null });
      pieces.push({ text: match[0], link });
      from = match.index + match[0].length;
    }
  }

  pieces.push({ text: text.slice(from), link: null });
  return pieces.filter((piece) => piece.text !== '');
}

/** Whether a match sits inside a URL — `https://host/a.ts` is the URL's, not a file's. */
function urlAround(text: string, index: number): boolean {
  const start = text.lastIndexOf(' ', index) + 1;
  return text.slice(start, index + 1).includes('://');
}

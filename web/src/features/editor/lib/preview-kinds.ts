/**
 * What a preview of a file shows (B-50, 07 · D-18):
 *
 * - `markdown`: the text rendered by the shared safe renderer;
 * - `image` and `svg`: the bytes as a blob in an `<img>` — a script in an SVG never runs there;
 * - `pdf`: drawn page by page by the pdf.js of our own build;
 * - `html`: **the source**, never the page — a page would be a script of the folder running in the
 *   app's origin.
 */
export type PreviewKind = 'markdown' | 'image' | 'svg' | 'pdf' | 'html';

/** The kinds by extension — the ones the server's preview list serves inline (backend/03). */
const KINDS: Readonly<Record<string, PreviewKind>> = {
  md: 'markdown',
  markdown: 'markdown',
  mdown: 'markdown',
  mkd: 'markdown',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  ico: 'image',
  svg: 'svg',
  pdf: 'pdf',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
};

/** The preview a file has — `null` for one that has none. */
export function previewKindOf(path: string): PreviewKind | null {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');

  return dot <= 0 ? null : (KINDS[name.slice(dot + 1).toLowerCase()] ?? null);
}

/** Whether a file has a preview at all — what "Open preview" is offered for. */
export function canPreview(path: string): boolean {
  return previewKindOf(path) !== null;
}

/** Whether a preview is drawn from the file's text — its buffer, unsaved changes included (S-312). */
export function previewsText(path: string): boolean {
  const kind = previewKindOf(path);
  return kind === 'markdown' || kind === 'html';
}

/**
 * Whether a file opens as its preview: an image or a PDF has no text to edit, so its "editor" is the
 * picture, as in the editor people know — the hexadecimal view is a toggle away.
 */
export function opensAsPreview(path: string): boolean {
  const kind = previewKindOf(path);
  return kind === 'image' || kind === 'pdf';
}

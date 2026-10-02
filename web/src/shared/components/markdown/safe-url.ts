/**
 * What a URL of a markdown text is — and therefore what it may become on screen
 * ([08 · D-04](../../../../../docs/plans/08-claude-panel/decisions.md#d-04--markdown-e-realce)):
 *
 * - `web`: `http` or `https` — a link that opens outside the app, an image that is **not** loaded;
 * - `mail`: `mailto`;
 * - `anchor`: `#…`, a place in the same text;
 * - `relative`: a path, which only the host knows how to resolve — a file of the open folder;
 * - `blocked`: everything else — `javascript:`, `data:`, `vbscript:`, `file:`, a protocol-relative
 *   `//host`, or a URL with a control character in it, which a browser would read past.
 */
export type UrlKind = 'web' | 'mail' | 'anchor' | 'relative' | 'blocked';

/** A scheme, as a URL starts with one. */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** Whether a URL holds a control character — what a browser strips or stops at before a scheme. */
function hasControl(url: string): boolean {
  return [...url].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

const SCHEMES: Readonly<Record<string, UrlKind>> = {
  http: 'web',
  https: 'web',
  mailto: 'mail',
};

/**
 * Whether a URL has a shape no link of a text needs: a control character, blanks around it, a host
 * without a scheme (`//host`, `\\host`).
 */
function isOddShape(url: string): boolean {
  return hasControl(url) || url.trim() !== url || /^[/\\]{2}/.test(url);
}

/** What a URL of a markdown text is. */
export function kindOfUrl(url: string): UrlKind {
  if (isOddShape(url)) {
    return 'blocked';
  }

  if (url.startsWith('#')) {
    return 'anchor';
  }

  const scheme = SCHEME.exec(url)?.[1]?.toLowerCase();

  if (scheme === undefined) {
    return url === '' ? 'blocked' : 'relative';
  }

  return SCHEMES[scheme] ?? 'blocked';
}

/** An attribute as text — what a renderer hands over may be absent, or not a string. */
export function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The URL a markdown text may keep — the same one, or `''` for one that is refused. What react-markdown
 * calls for every `href` and `src` it would write.
 */
export function safeUrl(url: string): string {
  return kindOfUrl(url) === 'blocked' ? '' : url;
}

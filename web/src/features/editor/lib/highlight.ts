import { loadEngine } from './engine-loader';
import { LANGUAGES, languageOf, PLAIN_TEXT } from './languages';

/**
 * The editor language of a fence of markdown — ```ts, ```python, ```json — by the names its files go
 * by, or the language id itself. Unknown, it is plain text.
 */
export function languageOfFence(fence: string): string {
  const name = fence.trim().toLowerCase();

  if (name === '') {
    return PLAIN_TEXT;
  }

  const byExtension = languageOf(`code.${name}`);

  if (byExtension !== PLAIN_TEXT) {
    return byExtension;
  }

  // The id itself — ```python, ```typescript — or a file the name is, like ```dockerfile.
  return Object.hasOwn(LANGUAGES, name) ? name : languageOf(name);
}

/** One run of coloured code: the class the editor's theme colours, and the text. */
export interface CodeToken {
  readonly className: string;
  readonly text: string;
}

/**
 * The lines of coloured HTML the editor made, as runs of text with a class — nothing else of it.
 *
 * The HTML is the editor's, made from the text, and it is still not put on the page as HTML: it is
 * read, and only the class of each run and its **text** go on (`react/no-danger` holds for code too).
 */
export function tokensOfColorized(html: string): CodeToken[][] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  let line: CodeToken[] = [];
  const lines: CodeToken[][] = [line];

  // A text takes the class of the element around it; a comment, or anything else, is not code.
  const walk = (element: Element): void => {
    for (const child of [...element.childNodes]) {
      if (child.nodeName === 'BR') {
        line = [];
        lines.push(line);
      } else if (child instanceof Element) {
        walk(child);
      } else if (child instanceof Text) {
        line.push({ className: element.className, text: child.data });
      }
    }
  };

  walk(document.body);
  return lines;
}

/**
 * A block of code, coloured as the editor colours it — loaded on demand, the editor's own engine,
 * one grammar and one theme for the whole product (plan 08, D-04). `null` when there is nothing to
 * colour it with — plain text, an engine that colours nothing — and the block stays monospaced.
 */
export async function colorizeCode(code: string, fence: string): Promise<CodeToken[][] | null> {
  const language = languageOfFence(fence);

  if (language === PLAIN_TEXT) {
    return null;
  }

  const engine = await loadEngine('monaco');
  return engine.colorize === undefined
    ? null
    : tokensOfColorized(await engine.colorize(code, language));
}

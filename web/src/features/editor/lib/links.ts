import { parentOf } from './paths';

/** The path part of a link — what is before its `?query` and its `#fragment`. */
function pathPart(href: string): string {
  const cut = href.search(/[?#]/);
  return cut === -1 ? href : href.slice(0, cut);
}

function decoded(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    // `%E0%A4%A` and the like: a link that names no file.
    return null;
  }
}

/**
 * Where a relative link of a markdown file leads, relative to the folder — `null` for one that leads
 * out of the folder or names nothing. `/x` is from the top of the folder, as a repository reads it;
 * anything else from the directory of the file (B-50, S-308).
 */
export function resolveLink(fromFile: string, href: string): string | null {
  const path = decoded(pathPart(href));

  if (path === null || path === '') {
    return null;
  }

  const base = path.startsWith('/') ? [] : parentOf(fromFile).split('/');
  const segments: string[] = base.filter((segment) => segment !== '');

  for (const segment of path.split('/')) {
    if (segment === '..') {
      if (segments.pop() === undefined) {
        return null;
      }
    } else if (segment !== '.' && segment !== '') {
      segments.push(segment);
    }
  }

  return segments.length === 0 ? null : segments.join('/');
}

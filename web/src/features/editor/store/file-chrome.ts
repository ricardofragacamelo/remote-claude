import { createRegistry } from '@/shared/lib/registry';
import type { FileChrome } from '../types/editor';

/**
 * Who shows extra chrome above a file's own editor, by its extension — the search editor's own
 * header over `.code-search` (plan 11, B-17) registers here at load. Nobody registered for a
 * path, and the editor shows the plain editor alone, same as always.
 */
export const fileChrome = createRegistry<FileChrome>('file chrome');

/** The first registered chrome whose own `matches` picks `path` — `null` for none. */
export function fileChromeFor(path: string): FileChrome | null {
  return fileChrome.entries().find((entry) => entry.matches(path)) ?? null;
}

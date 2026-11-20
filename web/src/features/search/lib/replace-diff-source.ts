import { readFile } from '@/features/editor';
import type { DiffSide, DiffSource } from '@/features/editor';
import { AppError } from '@/shared/api/errors';
import { previewReplace } from '../services/search.service';
import type { ReplacePreviewMatch, ReplaceQuery } from '../types/search';
import { appliedPreviewContent } from './applied-preview-content';

/** The id the replace preview registers its right side of a diff under (B-16). */
export const REPLACE_DIFF_SOURCE = 'search.replace';

interface ReplaceDiffKey {
  readonly path: string;
  readonly query: ReplaceQuery;
}

/** The disk as it is, and what it would become — the preview's own diff (plan 11, B-16, S-125). */
export function replaceDiffSides(
  path: string,
  query: ReplaceQuery,
): { readonly left: DiffSide; readonly right: DiffSide } {
  const key: ReplaceDiffKey = { path, query };

  return {
    left: { path, source: 'disk' },
    right: {
      path,
      source: 'provided',
      provided: {
        source: REPLACE_DIFF_SOURCE,
        key: JSON.stringify(key),
        labelKey: 'search.diff.after',
      },
    },
  };
}

function diffUnavailable(): AppError {
  return new AppError('NOT_FOUND', 'search.error.replaceDiffUnavailable', 'search.replace');
}

/** The matches of `path` alone, re-asked of the preview — never the whole folder's again. */
async function matchesOf(
  folder: string,
  path: string,
  query: ReplaceQuery,
  signal: AbortSignal,
): Promise<readonly ReplacePreviewMatch[]> {
  const stream = previewReplace(folder, { ...query, onlyPaths: [path] }, signal);
  let matches: readonly ReplacePreviewMatch[] = [];

  for await (const frame of stream) {
    if (frame.type === 'error') {
      throw frame.error;
    }
    if (frame.type === 'file' && frame.file.path === path) {
      matches = frame.file.matches;
    }
  }

  return matches;
}

/**
 * Where the editor reads the right side of a replace preview's diff (plan 11, B-16): the disk's
 * current content, with every match this exact query finds in `path` replaced — recomputed fresh
 * each time the tab shows, never the matches a now-stale preview held onto.
 */
export const REPLACE_DIFF_READER: DiffSource = {
  id: REPLACE_DIFF_SOURCE,
  position: 200,
  read: async (folder, raw) => {
    const { path, query } = JSON.parse(raw) as ReplaceDiffKey;
    const controller = new AbortController();
    const [matches, read] = await Promise.all([
      matchesOf(folder, path, query, controller.signal),
      readFile(folder, path),
    ]);

    if (read.kind === 'notModified') {
      throw diffUnavailable();
    }

    return appliedPreviewContent(read.file.content, matches);
  },
};

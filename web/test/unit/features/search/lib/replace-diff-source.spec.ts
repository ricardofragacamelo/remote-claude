import { afterEach, describe, expect, it, vi } from 'vitest';

import * as editorFeature from '@/features/editor';
import {
  REPLACE_DIFF_SOURCE,
  replaceDiffSides,
  REPLACE_DIFF_READER,
} from '@/features/search/lib/replace-diff-source';
import type { ReplaceQuery } from '@/features/search/types/search';
import { fakeSearchApi, refusal } from '../../../../support/search-api';

const FOLDER = '/srv/projects/a';
const QUERY: ReplaceQuery = {
  pattern: 'TODO',
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  useIgnoreFiles: true,
  replacement: 'DONE',
  preserveCase: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('replaceDiffSides — plan 11, B-16, S-125', () => {
  it('is the disk as it is, beside a provided side this source reads', () => {
    const sides = replaceDiffSides('a.ts', QUERY);

    expect(sides.left).toEqual({ path: 'a.ts', source: 'disk' });
    expect(sides.right).toMatchObject({ path: 'a.ts', source: 'provided' });
    expect(sides.right.provided?.source).toBe(REPLACE_DIFF_SOURCE);
    expect(JSON.parse(sides.right.provided!.key)).toEqual({ path: 'a.ts', query: QUERY });
  });
});

describe('REPLACE_DIFF_READER — plan 11, B-16, S-125', () => {
  it('reads the disk and the preview, and answers the content with the match spliced in', async () => {
    fakeSearchApi({
      replacePreview: () => [
        {
          type: 'file',
          path: 'a.ts',
          etag: 'sha256:1',
          matches: [
            {
              line: 1,
              column: 1,
              endColumn: 5,
              preview: 'TODO',
              previewMatchStart: 0,
              previewMatchEnd: 4,
              replacement: 'DONE',
            },
          ],
        },
        { type: 'end' },
      ],
    });
    vi.spyOn(editorFeature, 'readFile').mockResolvedValue({
      kind: 'read',
      file: {
        path: 'a.ts',
        content: 'TODO soon',
        etag: 'sha256:1',
        format: { encoding: 'utf8', bom: false, eol: 'lf' },
        size: 9,
        largeFile: false,
      },
    });

    const key = JSON.stringify({ path: 'a.ts', query: QUERY });
    const content = await REPLACE_DIFF_READER.read(FOLDER, key);

    expect(content).toBe('DONE soon');
  });

  it('propagates a refusal thrown before the first byte', async () => {
    const error = refusal('SEARCH_PATTERN_INVALID', 'search.error.patternInvalid');
    fakeSearchApi({ replacePreview: () => error });
    vi.spyOn(editorFeature, 'readFile').mockResolvedValue({
      kind: 'read',
      file: {
        path: 'a.ts',
        content: '',
        etag: 'x',
        format: { encoding: 'utf8', bom: false, eol: 'lf' },
        size: 0,
        largeFile: false,
      },
    });

    const key = JSON.stringify({ path: 'a.ts', query: QUERY });
    await expect(REPLACE_DIFF_READER.read(FOLDER, key)).rejects.toBe(error);
  });

  it('propagates an error line the stream ends with, after it started', async () => {
    fakeSearchApi({
      replacePreview: () => [
        { type: 'error', code: 'SEARCH_ENGINE_FAILED', messageKey: 'search.error.engineFailed' },
      ],
    });
    vi.spyOn(editorFeature, 'readFile').mockResolvedValue({
      kind: 'read',
      file: {
        path: 'a.ts',
        content: '',
        etag: 'x',
        format: { encoding: 'utf8', bom: false, eol: 'lf' },
        size: 0,
        largeFile: false,
      },
    });

    const key = JSON.stringify({ path: 'a.ts', query: QUERY });
    await expect(REPLACE_DIFF_READER.read(FOLDER, key)).rejects.toMatchObject({
      code: 'SEARCH_ENGINE_FAILED',
    });
  });

  it('refuses when the file cannot be read as content — asked with a version it already has', async () => {
    fakeSearchApi({ replacePreview: () => [{ type: 'end' }] });
    vi.spyOn(editorFeature, 'readFile').mockResolvedValue({ kind: 'notModified' });

    const key = JSON.stringify({ path: 'a.ts', query: QUERY });
    await expect(REPLACE_DIFF_READER.read(FOLDER, key)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

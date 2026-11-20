import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/shared/api/errors';
import {
  applyReplace,
  locateFiles,
  previewReplace,
  searchText,
  streamCutError,
} from '@/features/search/services/search.service';
import type { LocateQuery, ReplaceQuery, SearchQuery } from '@/features/search/types/search';
import { fakeSearchApi, refusal } from '../../../../support/search-api';

afterEach(() => {
  vi.restoreAllMocks();
});

const aLocateQuery: LocateQuery = { query: 'read', kinds: ['file', 'dir'] };
const aSearchQuery: SearchQuery = {
  pattern: 'TODO',
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  useIgnoreFiles: true,
};
const aReplaceQuery: ReplaceQuery = { ...aSearchQuery, replacement: 'DONE', preserveCase: false };

async function drain<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

describe('locateFiles', () => {
  it('asks the folder, the query, and every repeated field as its own param', async () => {
    const { get } = fakeSearchApi({
      locate: () => ({ entries: [], truncated: null }),
    });

    await locateFiles('/srv/projects/a', {
      query: 'read',
      kinds: ['file', 'dir'],
      prefer: ['/srv/projects/a/README.md'],
      limit: 20,
      includeIgnored: true,
    });

    const [path] = get.mock.calls[0] as [string];
    const asked = new URLSearchParams(path.split('?')[1]);
    expect(asked.get('folder')).toBe('/srv/projects/a');
    expect(asked.getAll('kinds')).toEqual(['file,dir']);
    expect(asked.get('prefer')).toBe('/srv/projects/a/README.md');
    expect(asked.get('limit')).toBe('20');
    expect(asked.get('includeIgnored')).toBe('true');
  });

  it('maps the entries and the truncation as they arrive', async () => {
    fakeSearchApi({
      locate: () => ({
        entries: [{ path: 'a.ts', kind: 'file', positions: [0, 1] }],
        truncated: { reason: 'limit' },
      }),
    });

    const result = await locateFiles('/srv/projects/a', aLocateQuery);

    expect(result).toEqual({
      entries: [{ path: 'a.ts', kind: 'file', positions: [0, 1] }],
      truncated: { reason: 'limit' },
    });
  });

  it('rejects with the backend’s own refusal', async () => {
    const error = refusal('WORKSPACE_FOLDER_NOT_OPEN', 'workspace.error.folderNotOpen');
    fakeSearchApi({ locate: () => error });

    await expect(locateFiles('/srv/projects/a', aLocateQuery)).rejects.toBe(error);
  });
});

describe('searchText', () => {
  it('yields a file frame mapped field for field', async () => {
    fakeSearchApi({
      text: () => [
        {
          type: 'file',
          path: 'a.ts',
          matches: [
            {
              line: 1,
              column: 2,
              endColumn: 6,
              preview: 'const TODO = 1',
              previewMatchStart: 6,
              previewMatchEnd: 10,
            },
          ],
          contextLines: [{ line: 2, text: 'next line' }],
        },
        { type: 'end', truncated: null, skipped: 0 },
      ],
    });

    const frames = await drain(
      searchText('/srv/projects/a', aSearchQuery, new AbortController().signal),
    );

    expect(frames).toEqual([
      {
        type: 'file',
        file: {
          path: 'a.ts',
          matches: [
            {
              line: 1,
              column: 2,
              endColumn: 6,
              preview: 'const TODO = 1',
              previewMatchStart: 6,
              previewMatchEnd: 10,
            },
          ],
          contextLines: [{ line: 2, text: 'next line' }],
        },
      },
      { type: 'end', truncated: null, skipped: 0 },
    ]);
  });

  it('defaults an absent matches/contextLines/truncated/skipped to the empty value', async () => {
    fakeSearchApi({ text: () => [{ type: 'file', path: 'a.ts' }, { type: 'end' }] });

    const frames = await drain(
      searchText('/srv/projects/a', aSearchQuery, new AbortController().signal),
    );

    expect(frames).toEqual([
      { type: 'file', file: { path: 'a.ts', matches: [], contextLines: [] } },
      { type: 'end', truncated: null, skipped: 0 },
    ]);
  });

  it('maps an error frame to the same AppError the backend described', async () => {
    fakeSearchApi({
      text: () => [
        {
          type: 'error',
          code: 'SEARCH_ENGINE_FAILED',
          messageKey: 'search.error.engineFailed',
          params: { x: 1 },
        },
      ],
    });

    const [frame] = await drain(
      searchText('/srv/projects/a', aSearchQuery, new AbortController().signal),
    );

    expect(frame).toEqual({
      type: 'error',
      error: expect.objectContaining({
        code: 'SEARCH_ENGINE_FAILED',
        messageKey: 'search.error.engineFailed',
      }),
    });
  });

  it('falls back to a generic error when an error frame is missing its own fields', async () => {
    fakeSearchApi({ text: () => [{ type: 'error' }] });

    const [frame] = await drain(
      searchText('/srv/projects/a', aSearchQuery, new AbortController().signal),
    );

    expect(frame).toEqual({
      type: 'error',
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        messageKey: 'common.error.unexpected',
      }),
    });
  });

  it('propagates a refusal thrown before the first byte', async () => {
    const error = refusal('INVALID_INPUT', 'search.error.queryInvalid');
    fakeSearchApi({ text: () => error });

    await expect(
      drain(searchText('/srv/projects/a', aSearchQuery, new AbortController().signal)),
    ).rejects.toBe(error);
  });

  it('remaps a mid-stream transport failure to SEARCH_ENGINE_FAILED — the same state as a cut stream (S-171)', async () => {
    fakeSearchApi({
      text: () => refusal('NETWORK_UNREACHABLE', 'common.error.networkUnreachable'),
    });

    await expect(
      drain(searchText('/srv/projects/a', aSearchQuery, new AbortController().signal)),
    ).rejects.toMatchObject({
      code: 'SEARCH_ENGINE_FAILED',
      messageKey: 'search.error.engineFailed',
    });
  });
});

describe('previewReplace', () => {
  it('yields a file frame with the etag and the resolved replacement', async () => {
    fakeSearchApi({
      replacePreview: () => [
        {
          type: 'file',
          path: 'a.ts',
          etag: 'sha256:abc',
          matches: [
            {
              line: 1,
              column: 2,
              endColumn: 6,
              preview: 'const TODO = 1',
              previewMatchStart: 6,
              previewMatchEnd: 10,
              replacement: 'DONE',
            },
          ],
        },
        { type: 'end', truncated: null, skipped: 1 },
      ],
    });

    const frames = await drain(
      previewReplace('/srv/projects/a', aReplaceQuery, new AbortController().signal),
    );

    expect(frames).toEqual([
      {
        type: 'file',
        file: {
          path: 'a.ts',
          etag: 'sha256:abc',
          matches: [
            {
              line: 1,
              column: 2,
              endColumn: 6,
              preview: 'const TODO = 1',
              previewMatchStart: 6,
              previewMatchEnd: 10,
              replacement: 'DONE',
            },
          ],
        },
      },
      { type: 'end', truncated: null, skipped: 1 },
    ]);
  });

  it('defaults an absent path/etag/matches to the empty value', async () => {
    fakeSearchApi({ replacePreview: () => [{ type: 'file' }, { type: 'end' }] });

    const frames = await drain(
      previewReplace('/srv/projects/a', aReplaceQuery, new AbortController().signal),
    );

    expect(frames[0]).toEqual({ type: 'file', file: { path: '', etag: '', matches: [] } });
  });

  it('remaps a mid-stream transport failure to SEARCH_ENGINE_FAILED, same as searchText', async () => {
    fakeSearchApi({
      replacePreview: () => refusal('NETWORK_UNREACHABLE', 'common.error.networkUnreachable'),
    });

    await expect(
      drain(previewReplace('/srv/projects/a', aReplaceQuery, new AbortController().signal)),
    ).rejects.toMatchObject({ code: 'SEARCH_ENGINE_FAILED' });
  });
});

describe('applyReplace', () => {
  it('sends the folder, the query and the files, and maps the report back', async () => {
    const { post } = fakeSearchApi({
      apply: () => ({
        report: {
          applied: ['a.ts'],
          changed: [],
          missing: [],
          skipped: [{ path: 'b.bin', reason: 'binary' }],
        },
      }),
    });

    const report = await applyReplace('/srv/projects/a', aReplaceQuery, [
      { path: 'a.ts', etag: 'sha256:abc' },
    ]);

    expect(report).toEqual({
      applied: ['a.ts'],
      changed: [],
      missing: [],
      skipped: [{ path: 'b.bin', reason: 'binary' }],
    });
    const [path, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/search/replace');
    expect(body['folder']).toBe('/srv/projects/a');
    expect(body['files']).toEqual([{ path: 'a.ts', etag: 'sha256:abc' }]);
  });

  it('rejects with the backend’s own refusal, never a partial report', async () => {
    const error = refusal('PRECONDITION_REQUIRED', 'search.error.etagRequired');
    fakeSearchApi({ apply: () => error });

    await expect(
      applyReplace('/srv/projects/a', aReplaceQuery, [{ path: 'a.ts', etag: 'sha256:abc' }]),
    ).rejects.toBe(error);
  });
});

describe('streamCutError', () => {
  it('is this client’s own classification, never a wire code the backend would send', () => {
    const error = streamCutError();

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('SEARCH_ENGINE_FAILED');
    expect(error.messageKey).toBe('search.error.engineFailed');
  });
});

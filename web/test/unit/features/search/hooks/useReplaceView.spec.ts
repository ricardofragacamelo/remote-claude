import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as editorFeature from '@/features/editor';
import { useReplaceView } from '@/features/search/hooks/useReplaceView';
import { forgetSearchView, searchViewStore } from '@/features/search/store/search-view.store';
import { providers } from '../../../../support/render';
import { fakeSearchApi, refusal } from '../../../../support/search-api';

const FOLDER = '/srv/projects/a';

afterEach(() => {
  vi.restoreAllMocks();
  forgetSearchView(null);
});

const aMatch = (line: number) => ({
  line,
  column: 1,
  endColumn: 5,
  preview: 'TODO soon',
  previewMatchStart: 0,
  previewMatchEnd: 4,
  replacement: 'DONE',
});

function openReplace(query: string, replacement: string): void {
  act(() => {
    searchViewStore(FOLDER).getState().setQuery(query);
    searchViewStore(FOLDER).getState().setReplaceOpen(true);
    searchViewStore(FOLDER).getState().setReplacement(replacement);
  });
}

describe('useReplaceView — plan 11, B-16', () => {
  it('asks no preview while the row is closed, or the query is empty', () => {
    const { ndjson } = fakeSearchApi({});

    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });
    expect(ndjson).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);

    act(() => {
      searchViewStore(FOLDER).getState().setQuery('TODO');
    });
    expect(ndjson).not.toHaveBeenCalled();
  });

  it('asks the preview with the replacement and "preserve case" once the row opens', async () => {
    const { ndjson } = fakeSearchApi({ replacePreview: () => [{ type: 'end' }] });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    act(() => {
      searchViewStore(FOLDER).getState().setPreserveCase(true);
    });

    await waitFor(() => {
      const last = ndjson.mock.calls.at(-1) as [string, Record<string, unknown>] | undefined;
      expect(last?.[1]).toMatchObject({ preserveCase: true });
    });
    const [, body] = ndjson.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(body).toMatchObject({
      folder: FOLDER,
      pattern: 'TODO',
      replacement: 'DONE',
      preserveCase: true,
    });
    expect(result.current.replaceOpen).toBe(true);
  });

  it('includes the include/exclude filters in the request, and leaves them out when blank', async () => {
    const { ndjson } = fakeSearchApi({ replacePreview: () => [{ type: 'end' }] });
    renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    act(() => {
      searchViewStore(FOLDER).getState().setInclude('*.ts, *.tsx');
      searchViewStore(FOLDER).getState().setExclude('*.spec.ts');
    });

    await waitFor(() => {
      const last = ndjson.mock.calls.at(-1) as [string, Record<string, unknown>] | undefined;
      expect(last?.[1]).toMatchObject({ include: ['*.ts', '*.tsx'], exclude: ['*.spec.ts'] });
    });

    act(() => {
      searchViewStore(FOLDER).getState().setInclude('');
      searchViewStore(FOLDER).getState().setExclude('');
    });

    await waitFor(() => {
      const last = ndjson.mock.calls.at(-1) as [string, Record<string, unknown>] | undefined;
      expect(last?.[1]).not.toHaveProperty('include');
      expect(last?.[1]).not.toHaveProperty('exclude');
    });
  });

  it('flattens the preview into rows, with the resolved replacement on every match', async () => {
    fakeSearchApi({
      replacePreview: () => [
        { type: 'file', path: 'a.ts', etag: 'sha256:1', matches: [aMatch(1), aMatch(2)] },
        { type: 'end' },
      ],
    });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.fileCount).toBe(1);
    });
    expect(result.current.resultCount).toBe(2);
    expect(result.current.rows[1]).toMatchObject({ kind: 'match', match: { replacement: 'DONE' } });
  });

  it('keeps the rows of the last successful preview when the next one refuses (S-114)', async () => {
    const search = fakeSearchApi({
      replacePreview: () => [
        { type: 'file', path: 'a.ts', etag: 'sha256:1', matches: [aMatch(1)] },
        { type: 'end' },
      ],
    });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.fileCount).toBe(1);
    });

    const error = refusal('SEARCH_PATTERN_INVALID', 'search.error.patternInvalid');
    search.ndjson.mockImplementation(() => {
      throw error;
    });
    act(() => {
      searchViewStore(FOLDER).getState().setIsRegex(true);
    });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
    expect(result.current.fileCount).toBe(1);
  });

  it('clears the retained rows once the replace row closes', async () => {
    fakeSearchApi({
      replacePreview: () => [
        { type: 'file', path: 'a.ts', etag: 'sha256:1', matches: [aMatch(1)] },
        { type: 'end' },
      ],
    });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.fileCount).toBe(1);
    });

    act(() => {
      searchViewStore(FOLDER).getState().setReplaceOpen(false);
    });
    expect(result.current.fileCount).toBe(0);
  });

  it('opens the diff of one file — the disk, beside what it would become', async () => {
    const openDiff = vi.spyOn(editorFeature, 'openDiff').mockImplementation(() => undefined);
    fakeSearchApi({ replacePreview: () => [{ type: 'end' }] });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.replaceOpen).toBe(true);
    });

    act(() => {
      result.current.openDiff('a.ts');
    });

    expect(openDiff).toHaveBeenCalledWith(
      FOLDER,
      { path: 'a.ts', source: 'disk' },
      expect.objectContaining({ path: 'a.ts', source: 'provided' }),
    );
  });

  it('does nothing opening a diff, or replacing, with the row closed', () => {
    const openDiff = vi.spyOn(editorFeature, 'openDiff').mockImplementation(() => undefined);
    fakeSearchApi({});
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    act(() => {
      result.current.openDiff('a.ts');
    });
    expect(openDiff).not.toHaveBeenCalled();

    return result.current.replaceAll().then((report) => {
      expect(report).toEqual({ applied: [], changed: [], missing: [], skipped: [] });
    });
  });

  it('replaces one file, and every file, each its own request (S-128)', async () => {
    fakeSearchApi({
      replacePreview: () => [
        { type: 'file', path: 'a.ts', etag: 'sha256:1', matches: [aMatch(1)] },
        { type: 'file', path: 'b.ts', etag: 'sha256:2', matches: [aMatch(1)] },
        { type: 'end' },
      ],
      apply: (body) => ({
        report: {
          applied: body['files'] as unknown as string[],
          changed: [],
          missing: [],
          skipped: [],
        },
      }),
    });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.fileCount).toBe(2);
    });

    const oneFile = await result.current.replaceFile('a.ts');
    expect(oneFile.applied).toEqual([{ path: 'a.ts', etag: 'sha256:1' }]);

    const all = await result.current.replaceAll();
    expect(all.applied).toEqual([
      { path: 'a.ts', etag: 'sha256:1' },
      { path: 'b.ts', etag: 'sha256:2' },
    ]);
  });

  it('answers a real refusal of the apply itself, through `applyError`, never thrown unhandled', async () => {
    const error = refusal('PAYLOAD_TOO_LARGE', 'search.error.replaceTooManyFiles');
    fakeSearchApi({
      replacePreview: () => [
        { type: 'file', path: 'a.ts', etag: 'sha256:1', matches: [aMatch(1)] },
        { type: 'end' },
      ],
      apply: () => error,
    });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.fileCount).toBe(1);
    });

    await expect(result.current.replaceAll()).rejects.toBe(error);
    await waitFor(() => {
      expect(result.current.applyError).toBe(error);
    });
  });

  it('never touches a fully dismissed file — a dismissed match alone still goes with the rest', async () => {
    fakeSearchApi({
      replacePreview: () => [
        { type: 'file', path: 'a.ts', etag: 'sha256:1', matches: [aMatch(1), aMatch(2)] },
        { type: 'file', path: 'b.ts', etag: 'sha256:2', matches: [aMatch(1)] },
        { type: 'end' },
      ],
      apply: (body) => ({
        report: {
          applied: body['files'] as unknown as string[],
          changed: [],
          missing: [],
          skipped: [],
        },
      }),
    });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.fileCount).toBe(2);
    });

    act(() => {
      searchViewStore(FOLDER).getState().dismissMatch('a.ts', 1, 1);
      searchViewStore(FOLDER).getState().dismissFile('b.ts');
    });

    expect(result.current.fileCount).toBe(1);
    const all = await result.current.replaceAll();
    expect(all.applied).toEqual([{ path: 'a.ts', etag: 'sha256:1' }]);
  });

  it('reports nothing for a file the preview no longer knows about', async () => {
    fakeSearchApi({ replacePreview: () => [{ type: 'end' }] });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.replaceOpen).toBe(true);
    });

    const report = await result.current.replaceFile('gone.ts');
    expect(report).toEqual({ applied: [], changed: [], missing: [], skipped: [] });
  });

  it('redoing the preview clears the last report and asks again', async () => {
    const { ndjson } = fakeSearchApi({
      replacePreview: () => [
        { type: 'file', path: 'a.ts', etag: 'sha256:1', matches: [aMatch(1)] },
        { type: 'end' },
      ],
      apply: () => ({ report: { applied: [], changed: ['a.ts'], missing: [], skipped: [] } }),
    });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.fileCount).toBe(1);
    });

    await act(async () => {
      await result.current.replaceAll();
    });
    await waitFor(() => {
      expect(result.current.report).toMatchObject({ changed: ['a.ts'] });
    });

    const before = ndjson.mock.calls.length;
    act(() => {
      result.current.redoPreview();
    });
    await waitFor(() => {
      expect(result.current.report).toBeUndefined();
    });
    await waitFor(() => {
      expect(ndjson.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('collapses every file of the preview on screen, and copies every one of its results', async () => {
    fakeSearchApi({
      replacePreview: () => [
        { type: 'file', path: 'a.ts', etag: 'sha256:1', matches: [aMatch(1)] },
        { type: 'file', path: 'b.ts', etag: 'sha256:2', matches: [aMatch(2)] },
        { type: 'end' },
      ],
    });
    const { result } = renderHook(() => useReplaceView(FOLDER), { wrapper: providers() });

    openReplace('TODO', 'DONE');
    await waitFor(() => {
      expect(result.current.fileCount).toBe(2);
    });

    act(() => {
      result.current.collapseAll();
    });
    expect(result.current.rows.every((row) => row.kind !== 'file' || row.collapsed)).toBe(true);

    expect(result.current.copyAllText()).toContain('a.ts');
    expect(result.current.copyAllText()).toContain('b.ts');
  });

  it('is the folder tab’s own — another folder sees none of it (S-121)', () => {
    searchViewStore(FOLDER).getState().setReplacement('mine');

    expect(searchViewStore('/srv/projects/other').getState().replacement).toBe('');
  });
});

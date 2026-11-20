import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as editorFeature from '@/features/editor';
import { useSearchView } from '@/features/search/hooks/useSearchView';
import { forgetSearchView, searchViewStore } from '@/features/search/store/search-view.store';
import { providers } from '../../../../support/render';
import { fakeSearchApi, refusal } from '../../../../support/search-api';
import { fakeWatches } from '../../../../support/explorer';

const FOLDER = '/srv/projects/a';

afterEach(() => {
  vi.restoreAllMocks();
  forgetSearchView(null);
});

const aMatch = (line: number) => ({
  line,
  column: 1,
  endColumn: 5,
  preview: 'TODO',
  previewMatchStart: 0,
  previewMatchEnd: 4,
});

describe('useSearchView — plan 11, B-15', () => {
  it('asks nothing while the query is empty', () => {
    const { ndjson } = fakeSearchApi({});
    fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });

    expect(ndjson).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it('asks nothing of its own while the replace row is open — B-16, D-06', () => {
    const { ndjson } = fakeSearchApi({ text: () => [{ type: 'end' }] });
    fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });
    act(() => {
      searchViewStore(FOLDER).getState().setReplaceOpen(true);
      searchViewStore(FOLDER).getState().setQuery('TODO');
    });

    expect(ndjson).not.toHaveBeenCalled();
    expect(result.current.replaceOpen).toBe(true);
  });

  it('holds no `workspace.watch` of the folder while there is no search of its own', () => {
    fakeSearchApi({});
    const watches = fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });
    expect(watches.held(FOLDER)).toBe(0);

    act(() => {
      result.current.setQuery('TODO');
    });
    expect(watches.held(FOLDER)).toBe(1);

    act(() => {
      result.current.setQuery('');
    });
    expect(watches.held(FOLDER)).toBe(0);
  });

  it('builds the request from every flag and filter typed', async () => {
    const { ndjson } = fakeSearchApi({ text: () => [{ type: 'end' }] });
    fakeWatches();
    vi.spyOn(editorFeature, 'openFiles').mockReturnValue(['open.ts']);

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });

    act(() => {
      result.current.setQuery('TODO');
      result.current.setIsRegex(true);
      result.current.setCaseSensitive(true);
      result.current.setWholeWord(true);
      result.current.setInclude('*.ts, *.tsx');
      result.current.setExclude('*.spec.ts');
      result.current.setUseIgnoreFiles(false);
      result.current.setOnlyOpenEditors(true);
    });

    await waitFor(() => {
      expect(ndjson).toHaveBeenCalled();
    });
    const [, body] = ndjson.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toMatchObject({
      folder: FOLDER,
      pattern: 'TODO',
      isRegex: true,
      caseSensitive: true,
      wholeWord: true,
      include: ['*.ts', '*.tsx'],
      exclude: ['*.spec.ts'],
      useIgnoreFiles: false,
      onlyPaths: ['open.ts'],
    });
  });

  it('flattens the results into rows, and counts only what is not dismissed', async () => {
    fakeSearchApi({
      text: () => [
        { type: 'file', path: 'a.ts', matches: [aMatch(1), aMatch(2)], contextLines: [] },
        { type: 'end' },
      ],
    });
    fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });
    act(() => {
      result.current.setQuery('TODO');
    });
    await waitFor(() => {
      expect(result.current.fileCount).toBe(1);
    });
    expect(result.current.resultCount).toBe(2);

    act(() => {
      result.current.dismissMatch('a.ts', 1, 1);
    });
    expect(result.current.resultCount).toBe(1);

    act(() => {
      result.current.dismissFile('a.ts');
    });
    expect(result.current.fileCount).toBe(0);
    expect(result.current.resultCount).toBe(0);
  });

  it('keeps the rows of the last successful search when the next one refuses (S-114)', async () => {
    const search = fakeSearchApi({
      text: () => [
        { type: 'file', path: 'a.ts', matches: [aMatch(1)], contextLines: [] },
        { type: 'end' },
      ],
    });
    fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });
    act(() => {
      result.current.setQuery('TODO');
    });
    await waitFor(() => {
      expect(result.current.fileCount).toBe(1);
    });

    const error = refusal('SEARCH_PATTERN_INVALID', 'search.error.patternInvalid');
    search.ndjson.mockImplementation(() => {
      throw error;
    });
    act(() => {
      result.current.setIsRegex(true);
    });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
    expect(result.current.fileCount).toBe(1);
    expect(result.current.rows[0]).toMatchObject({ kind: 'file', path: 'a.ts' });
  });

  it('opens the match’s file at its line, with the matched text selected', async () => {
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    fakeSearchApi({});
    fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });

    act(() => {
      result.current.open('a.ts', aMatch(3), false);
    });

    expect(openFile).toHaveBeenCalledWith(FOLDER, 'a.ts', {
      selection: { startLine: 3, startColumn: 1, endLine: 3, endColumn: 5 },
      toSide: false,
    });
  });

  it('marks a changed file stale, and "search again" clears it and asks once more', async () => {
    const { ndjson } = fakeSearchApi({
      text: () => [
        { type: 'file', path: 'a.ts', matches: [aMatch(1)], contextLines: [] },
        { type: 'end' },
      ],
    });
    const watches = fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });
    act(() => {
      result.current.setQuery('TODO');
    });
    await waitFor(() => {
      expect(result.current.fileCount).toBe(1);
    });

    act(() => {
      watches.subscriber(FOLDER).onChanges([{ path: 'a.ts', kind: 'changed' }], false);
    });
    expect(result.current.rows[0]).toMatchObject({ kind: 'file', stale: true });

    const before = ndjson.mock.calls.length;
    act(() => {
      result.current.searchAgain();
    });

    expect(result.current.rows[0]).toMatchObject({ kind: 'file', stale: false });
    await waitFor(() => {
      expect(ndjson.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('marks every result stale on overflow — more changed than the event carries', async () => {
    fakeSearchApi({
      text: () => [
        { type: 'file', path: 'a.ts', matches: [aMatch(1)], contextLines: [] },
        { type: 'file', path: 'b.ts', matches: [aMatch(2)], contextLines: [] },
        { type: 'end' },
      ],
    });
    const watches = fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });
    act(() => {
      result.current.setQuery('TODO');
    });
    await waitFor(() => {
      expect(result.current.fileCount).toBe(2);
    });

    act(() => {
      watches.subscriber(FOLDER).onChanges([], true);
    });

    expect(result.current.rows.filter((row) => row.kind === 'file')).toEqual([
      expect.objectContaining({ path: 'a.ts', stale: true }),
      expect.objectContaining({ path: 'b.ts', stale: true }),
    ]);
  });

  it('collapses every file on screen at once, toggles one, and expands them all back', async () => {
    fakeSearchApi({
      text: () => [
        { type: 'file', path: 'a.ts', matches: [aMatch(1)], contextLines: [] },
        { type: 'file', path: 'b.ts', matches: [aMatch(2)], contextLines: [] },
        { type: 'end' },
      ],
    });
    fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });
    act(() => {
      result.current.setQuery('TODO');
    });
    await waitFor(() => {
      expect(result.current.fileCount).toBe(2);
    });

    act(() => {
      result.current.collapseAll();
    });
    expect(result.current.rows.every((row) => row.kind !== 'file' || row.collapsed)).toBe(true);

    act(() => {
      result.current.toggleCollapsed('a.ts');
    });
    expect(
      result.current.rows.find((row) => row.kind === 'file' && row.path === 'a.ts'),
    ).toMatchObject({ collapsed: false });

    act(() => {
      result.current.expandAll();
    });
    expect(result.current.rows.every((row) => row.kind !== 'file' || !row.collapsed)).toBe(true);
  });

  it('logs, never throws, when the watch stops or is refused', () => {
    fakeSearchApi({});
    const watches = fakeWatches();

    const { result } = renderHook(() => useSearchView(FOLDER), { wrapper: providers() });
    act(() => {
      result.current.setQuery('TODO');
    });
    const subscriber = watches.subscriber(FOLDER);

    expect(() => {
      subscriber.onWatching(true);
      subscriber.onStopped('folderDeleted');
      subscriber.onRefused({ code: 'WATCH_UNAVAILABLE', params: {}, traceId: null });
    }).not.toThrow();
  });

  it('is the folder tab’s own — another folder sees none of it (S-121)', () => {
    searchViewStore(FOLDER).getState().setQuery('TODO');

    expect(searchViewStore('/srv/projects/other').getState().query).toBe('');
  });
});

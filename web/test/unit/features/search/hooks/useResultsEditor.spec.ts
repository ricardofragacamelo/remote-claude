import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { commandRegistry } from '@/features/commands';
import { serializeCodeSearch } from '@/features/search/lib/code-search-format';
import type { CodeSearchHeader } from '@/features/search/lib/code-search-format';
import { useResultsEditor } from '@/features/search/hooks/useResultsEditor';
import { fakeSearchApi, refusal } from '../../../../support/search-api';

const FOLDER = '/srv/projects/a';
const COMMAND_ID = 'search.resultsEditor.goToResult';

const { activeView, openFile } = vi.hoisted(() => ({ activeView: vi.fn(), openFile: vi.fn() }));

vi.mock('@/features/editor', () => ({ activeView, openFile }));

function aHeader(overrides: Partial<CodeSearchHeader> = {}): CodeSearchHeader {
  return {
    query: 'TODO',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: '',
    useIgnoreFiles: true,
    contextLines: 1,
    ...overrides,
  };
}

function aModel(text: string) {
  let value = text;
  const listeners = new Set<() => void>();
  return {
    getValue: vi.fn(() => value),
    setValue: vi.fn((next: string) => {
      value = next;
      for (const listener of listeners) listener();
    }),
    onDidChange: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  activeView.mockReset();
  openFile.mockReset();
});

describe('useResultsEditor — plan 11, B-17', () => {
  it('reads the header back from the document’s own text', () => {
    const model = aModel(serializeCodeSearch(aHeader({ query: 'fix me' }), []));
    const { result } = renderHook(() => useResultsEditor(FOLDER, { path: 'r.code-search', model }));

    expect(result.current.header.query).toBe('fix me');
  });

  it('answers an empty header for a document with no model yet', () => {
    const { result } = renderHook(() =>
      useResultsEditor(FOLDER, { path: 'r.code-search', model: null }),
    );

    expect(result.current.header.query).toBe('');
  });

  it('run again re-runs the search and rewrites the buffer with the fresh results', async () => {
    fakeSearchApi({
      text: () => [
        {
          type: 'file',
          path: 'src/a.ts',
          matches: [
            {
              line: 3,
              column: 1,
              endColumn: 5,
              preview: 'fix me',
              previewMatchStart: 0,
              previewMatchEnd: 3,
            },
          ],
          contextLines: [],
        },
        { type: 'end' },
      ],
    });
    const model = aModel(serializeCodeSearch(aHeader({ query: 'fix me' }), []));
    const { result } = renderHook(() => useResultsEditor(FOLDER, { path: 'r.code-search', model }));

    act(() => {
      result.current.runAgain();
    });
    expect(result.current.isRunning).toBe(true);

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false);
    });

    expect(model.setValue).toHaveBeenCalledWith(expect.stringContaining('src/a.ts:\n  3: fix me'));
    expect(result.current.error).toBeNull();
  });

  it('run again surfaces an error frame mid-stream, after files already arrived', async () => {
    fakeSearchApi({
      text: () => [
        { type: 'file', path: 'src/a.ts', matches: [], contextLines: [] },
        { type: 'error', code: 'SEARCH_ENGINE_FAILED', messageKey: 'search.error.engineFailed' },
      ],
    });
    const model = aModel(serializeCodeSearch(aHeader(), []));
    const { result } = renderHook(() => useResultsEditor(FOLDER, { path: 'r.code-search', model }));

    act(() => {
      result.current.runAgain();
    });

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false);
    });

    expect(result.current.error?.messageKey).toBe('search.error.engineFailed');
    expect(model.setValue).not.toHaveBeenCalled();
  });

  it('setContextLines does nothing for a document with no model yet', () => {
    const { result } = renderHook(() =>
      useResultsEditor(FOLDER, { path: 'r.code-search', model: null }),
    );

    expect(() => {
      act(() => {
        result.current.setContextLines(5);
      });
    }).not.toThrow();
  });

  it('run again does nothing for a document with no model yet', () => {
    const { result } = renderHook(() =>
      useResultsEditor(FOLDER, { path: 'r.code-search', model: null }),
    );

    act(() => {
      result.current.runAgain();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('run again surfaces a translated error, the buffer left as it was', async () => {
    fakeSearchApi({
      text: () => refusal('SEARCH_ENGINE_FAILED', 'search.error.engineFailed'),
    });
    const model = aModel(serializeCodeSearch(aHeader(), []));
    const { result } = renderHook(() => useResultsEditor(FOLDER, { path: 'r.code-search', model }));

    act(() => {
      result.current.runAgain();
    });

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false);
    });

    expect(result.current.error?.messageKey).toBe('search.error.engineFailed');
    expect(model.setValue).not.toHaveBeenCalled();
  });

  it('setContextLines rewrites only the header’s own line', () => {
    const model = aModel(serializeCodeSearch(aHeader({ contextLines: 1 }), []));
    const { result } = renderHook(() => useResultsEditor(FOLDER, { path: 'r.code-search', model }));

    act(() => {
      result.current.setContextLines(5);
    });

    expect(model.setValue).toHaveBeenCalledWith(expect.stringContaining('# ContextLines: 5'));
  });

  it('F12 opens the result at the cursor’s own buffer line', () => {
    const text = serializeCodeSearch(aHeader(), [
      {
        path: 'src/a.ts',
        matches: [
          {
            line: 3,
            column: 1,
            endColumn: 5,
            preview: 'fix',
            previewMatchStart: 0,
            previewMatchEnd: 3,
          },
        ],
        contextLines: [],
      },
    ]);
    const model = aModel(text);
    renderHook(() => useResultsEditor(FOLDER, { path: 'r.code-search', model }));
    const line = text.split('\n').findIndex((each) => each.includes('3: fix')) + 1;
    activeView.mockReturnValue({ position: () => ({ line, column: 1 }) });

    commandRegistry.command(COMMAND_ID)?.run();

    expect(openFile).toHaveBeenCalledWith(FOLDER, 'src/a.ts', { line: 3 });
  });

  it('does nothing when the cursor is not on a result line', () => {
    const model = aModel(serializeCodeSearch(aHeader(), []));
    renderHook(() => useResultsEditor(FOLDER, { path: 'r.code-search', model }));
    activeView.mockReturnValue({ position: () => ({ line: 1, column: 1 }) });

    commandRegistry.command(COMMAND_ID)?.run();

    expect(openFile).not.toHaveBeenCalled();
  });

  it('does nothing when there is no active view', () => {
    const model = aModel(serializeCodeSearch(aHeader(), []));
    renderHook(() => useResultsEditor(FOLDER, { path: 'r.code-search', model }));
    activeView.mockReturnValue(null);

    commandRegistry.command(COMMAND_ID)?.run();

    expect(openFile).not.toHaveBeenCalled();
  });
});

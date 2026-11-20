import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useApplyReplace } from '@/features/search/hooks/useApplyReplace';
import type { ReplaceQuery } from '@/features/search/types/search';
import { providers } from '../../../../support/render';
import { fakeSearchApi, refusal } from '../../../../support/search-api';

afterEach(() => {
  vi.restoreAllMocks();
});

const aQuery: ReplaceQuery = {
  pattern: 'TODO',
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  useIgnoreFiles: true,
  replacement: 'DONE',
  preserveCase: false,
};

describe('useApplyReplace', () => {
  it('starts idle, with no report and nothing applying', () => {
    const { result } = renderHook(() => useApplyReplace('/srv/projects/a'), {
      wrapper: providers(),
    });

    expect(result.current).toMatchObject({ isApplying: false, error: null, report: undefined });
  });

  it('reports what the backend applied, changed, missed and skipped — never optimistic', async () => {
    fakeSearchApi({
      apply: () => ({
        report: {
          applied: ['a.ts'],
          changed: ['b.ts'],
          missing: ['c.ts'],
          skipped: [{ path: 'd.bin', reason: 'binary' }],
        },
      }),
    });

    const { result } = renderHook(() => useApplyReplace('/srv/projects/a'), {
      wrapper: providers(),
    });

    act(() => {
      void result.current.apply({
        query: aQuery,
        files: [{ path: 'a.ts', etag: 'sha256:abc' }],
      });
    });

    await waitFor(() => {
      expect(result.current.report).toEqual({
        applied: ['a.ts'],
        changed: ['b.ts'],
        missing: ['c.ts'],
        skipped: [{ path: 'd.bin', reason: 'binary' }],
      });
    });
    expect(result.current.isApplying).toBe(false);
  });

  it('rejects with the backend’s own refusal, as a real failure of the request', async () => {
    const error = refusal('PRECONDITION_REQUIRED', 'search.error.etagRequired');
    fakeSearchApi({ apply: () => error });

    const { result } = renderHook(() => useApplyReplace('/srv/projects/a'), {
      wrapper: providers(),
    });

    let caught: unknown;
    act(() => {
      result.current
        .apply({ query: aQuery, files: [{ path: 'a.ts', etag: 'sha256:abc' }] })
        .catch((error_: unknown) => {
          caught = error_;
        });
    });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
    expect(caught).toBe(error);
    expect(result.current.report).toBeUndefined();
  });

  it('resets back to idle, dropping the last report and error', async () => {
    const error = refusal('PRECONDITION_REQUIRED', 'search.error.etagRequired');
    fakeSearchApi({ apply: () => error });
    const { result } = renderHook(() => useApplyReplace('/srv/projects/a'), {
      wrapper: providers(),
    });
    act(() => {
      result.current.apply({ query: aQuery, files: [] }).catch(() => undefined);
    });
    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });

    act(() => {
      result.current.reset();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
    expect(result.current.report).toBeUndefined();
  });
});

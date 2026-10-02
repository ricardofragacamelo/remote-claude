import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useRestore } from '@/features/file-history/hooks/useRestore';
import { forgetTimeline, timelineStore } from '@/features/file-history/store/timeline.store';
import type { HistoryEntry } from '@/features/file-history/types/history';
import { editorStoreOf } from '@/features/editor/store/editor.store';
import { aDocument } from '@/features/editor/store/editor.store';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../support/render';

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
  forgetTimeline(null);
});

const entry: HistoryEntry = {
  id: 'h-1',
  path: 'a.ts',
  entryKind: 'file',
  reason: 'save',
  kept: 'yes',
  sizeBytes: 1,
  author: { self: true, id: 'me' },
  at: '2026-10-01T10:00:00.000Z',
  batchId: null,
};

function restorer() {
  return renderHook(() => useRestore(APP), { wrapper: providers() });
}

describe('restoring a version, where the screen does not reach — plan 07, S-346', () => {
  it('reads the version on disk of a file the editor does not hold, and names it in If-Match', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ etag: '"disk"', content: 'x' });
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ path: 'a.ts', etag: '"2"', written: true });
    const { result } = restorer();

    await act(async () => {
      result.current.request(entry, false);
      await vi.waitFor(() => {
        expect(post).toHaveBeenCalled();
      });
    });

    expect(post.mock.calls[0]?.[2]).toEqual({ headers: { 'if-match': '"disk"' } });
    expect(result.current.restored).toBe(entry);
  });

  it('recreates a file deleted under its tab — no If-Match', async () => {
    editorStoreOf(APP).setState((state) => ({
      docs: { ...state.docs, 'a.ts': { ...aDocument('a.ts'), etag: '"old"', deleted: true } },
    }));
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ path: 'a.ts', etag: '"2"', written: true });
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    const { result } = restorer();

    await act(async () => {
      result.current.request(entry, false);
      await vi.waitFor(() => {
        expect(post).toHaveBeenCalled();
      });
    });

    expect(post.mock.calls[0]?.[2]).toEqual({});
  });

  it('sends one restore while one is on its way, and says an unexpected failure as one', async () => {
    let fail = (): void => undefined;
    const post = vi.spyOn(api, 'post').mockReturnValue(
      new Promise((_, reject) => {
        fail = () => {
          reject(new Error('network'));
        };
      }),
    );
    const { result } = restorer();

    act(() => {
      result.current.request(entry, true);
    });
    await vi.waitFor(() => {
      expect(result.current.pending).toBe(true);
    });
    act(() => {
      result.current.request(entry, true);
    });
    fail();
    await waitFor(() => {
      expect(result.current.pending).toBe(false);
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.failure).toEqual({
      path: 'a.ts',
      error: expect.objectContaining({ code: 'INTERNAL_ERROR' }) as unknown,
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.failure).toBeNull();
  });

  it('confirms nothing when nothing was asked', () => {
    const post = vi.spyOn(api, 'post');
    const { result } = restorer();

    act(() => {
      result.current.confirm();
    });

    expect(post).not.toHaveBeenCalled();
    expect(timelineStore(APP).getState().question).toBeNull();
  });

  it('keeps the server’s refusal as it came', async () => {
    const refusal = new AppError(
      'HISTORY_ENTRY_NOT_FOUND',
      'files.error.historyEntryNotFound',
      't',
    );
    vi.spyOn(api, 'post').mockRejectedValue(refusal);
    const { result } = restorer();

    act(() => {
      result.current.request(entry, true);
    });
    await waitFor(() => {
      expect(result.current.failure).not.toBeNull();
    });

    expect(result.current.failure?.error).toBe(refusal);
  });
});

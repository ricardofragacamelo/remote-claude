import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

import { useDeleteFlow } from '@/features/explorer/hooks/useDeleteFlow';
import type { DeleteHandlers } from '@/features/explorer/hooks/useDeleteFlow';
import type { ItemResult } from '@/features/explorer/lib/batch';
import { forgetExplorer } from '@/features/explorer/store/explorer.store';
import { FakeFolder, filesRefusal } from '../../../../support/files-api';

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
  forgetExplorer(null);
});

/** What the screen does for the flow — only `finished` is looked at here. */
function handlers(finished: (results: readonly ItemResult[]) => void): DeleteHandlers {
  return { finished, askSensitive: vi.fn(), undo: vi.fn() };
}

describe('the delete flow, where the screen does not reach', () => {
  it('confirms nothing when nothing was asked', async () => {
    const disk = new FakeFolder(APP, {}).install();
    const finished = vi.fn();
    const { result } = renderHook(() =>
      useDeleteFlow({ folder: APP, client: new QueryClient() }, handlers(finished)),
    );

    await act(async () => {
      await result.current.confirm();
    });

    expect(disk.calls).toEqual([]);
    expect(finished).not.toHaveBeenCalled();
  });

  it('reads a count the server did not give as none', async () => {
    const disk = new FakeFolder(APP, { 'full/a.ts': 'a' }).install();
    disk.refuseNext(
      (call) => call.method === 'DELETE' && call.query.get('keepInHistory') === null,
      filesRefusal('DIRECTORY_NOT_EMPTY', 'files.error.directoryNotEmpty', { path: 'full' }),
    );
    const { result } = renderHook(() =>
      useDeleteFlow({ folder: APP, client: new QueryClient() }, handlers(vi.fn())),
    );

    act(() => {
      result.current.ask(['full']);
    });
    await vi.waitFor(() => {
      expect(result.current.current?.step).toBe('confirm');
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.current).toMatchObject({
      step: 'count',
      counted: [{ path: 'full', entryCount: 0, capped: false }],
    });
  });

  it('sends one delete kept in the history while one is on its way — plan 07, B-58', async () => {
    const disk = new FakeFolder(APP, { 'a.ts': 'a' }).install();
    const release = disk.hold((call) => call.method === 'DELETE');
    const { result } = renderHook(() =>
      useDeleteFlow({ folder: APP, client: new QueryClient() }, handlers(vi.fn())),
    );

    act(() => {
      result.current.ask(['a.ts']);
    });
    await vi.waitFor(() => {
      expect(result.current.pending).toBe(true);
    });
    act(() => {
      result.current.ask(['a.ts']);
    });
    release();
    await vi.waitFor(() => {
      expect(result.current.current?.step).toBe('confirm');
    });

    expect(disk.callsTo('DELETE', '/files')).toHaveLength(1);
  });

  it('asks the second step for good when only the definitive delete asks it', async () => {
    const disk = new FakeFolder(APP, { 'a.ts': 'a' }).install();
    disk.refuseNext(
      (call) => call.method === 'DELETE' && call.query.get('keepInHistory') === null,
      filesRefusal('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
        path: 'a.ts',
        reason: 'sensitiveFile',
      }),
    );
    const finished = vi.fn();
    const { result } = renderHook(() =>
      useDeleteFlow({ folder: APP, client: new QueryClient() }, handlers(finished)),
    );

    act(() => {
      result.current.ask(['a.ts']);
    });
    await vi.waitFor(() => {
      expect(result.current.current?.step).toBe('confirm');
    });
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.current).toMatchObject({ step: 'count', sensitive: ['a.ts'] });

    await act(async () => {
      await result.current.confirm();
    });
    expect(disk.callsTo('DELETE', '/files').at(-1)?.query.get('confirmSensitive')).toBe('true');
    expect(finished).toHaveBeenCalledWith([{ path: 'a.ts', ok: true }]);
  });
});

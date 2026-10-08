import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useToolResult } from '@/features/session/hooks/useToolResult';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

const WHOLE = { text: 'every line', truncated: false, bytes: 10 };

/** The whole output of a tool, asked for once — plan 22, B-29. */
describe('useToolResult', () => {
  it('asks for nothing until the row is unfolded — S-116', () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(WHOLE);

    const { result } = renderHook(() => useToolResult('c1', 't1', false), {
      wrapper: providers(),
    });

    expect(get).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ output: null, isLoading: false, error: null });
  });

  it('asks for nothing without a conversation of the store to read it from', () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(WHOLE);

    renderHook(() => useToolResult(null, 't1', true), { wrapper: providers() });

    expect(get).not.toHaveBeenCalled();
  });

  it('reads it once, however often it is folded and unfolded — S-113', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(WHOLE);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useToolResult('c1', 't1', enabled),
      { wrapper: providers(), initialProps: { enabled: true } },
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.output).toEqual({ ...WHOLE, cutAt: null });
    });
    rerender({ enabled: false });
    rerender({ enabled: true });

    expect(result.current.output?.text).toBe('every line');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      '/transcripts/c1/tools/t1/result',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('says why it did not come, and tries again when asked — S-115', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 'tr'))
      .mockResolvedValueOnce(WHOLE);

    const { result } = renderHook(() => useToolResult('c1', 't1', true), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.error?.code).toBe('NETWORK_UNREACHABLE');
    });
    expect(get).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.output?.text).toBe('every line');
    });
    expect(result.current.error).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });
});

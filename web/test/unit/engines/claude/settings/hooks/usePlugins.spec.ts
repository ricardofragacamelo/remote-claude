import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { usePlugins } from '@/engines/claude/settings/hooks/usePlugins';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePlugins — plan 13, B-29', () => {
  it('reads the store, unwrapped', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ plugins: [{ id: 'p1', name: 'my-plugin' }] });

    const { result } = renderHook(() => usePlugins(), { wrapper: providers() });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.plugins).toEqual([{ id: 'p1', name: 'my-plugin' }]);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('answers an empty list, never undefined', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ plugins: [] });

    const { result } = renderHook(() => usePlugins(), { wrapper: providers() });
    expect(result.current.plugins).toEqual([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('carries the failure as an AppError, and retry asks again', async () => {
    const failure = new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1');
    const get = vi.spyOn(api, 'get').mockRejectedValue(failure);

    const { result } = renderHook(() => usePlugins(), { wrapper: providers() });
    await waitFor(() => {
      expect(result.current.error).toBe(failure);
    });

    result.current.retry();
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});

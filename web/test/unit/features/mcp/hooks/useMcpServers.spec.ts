import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useMcpServers } from '@/features/mcp/hooks/useMcpServers';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMcpServers', () => {
  it('reads the store of one engine, unwrapped', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ servers: [{ id: 's1', name: 'github' }] });

    const { result } = renderHook(() => useMcpServers('claude'), { wrapper: providers() });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.servers).toEqual([{ id: 's1', name: 'github' }]);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('answers an empty list, never undefined, before the read settles or on an empty store', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ servers: [] });

    const { result } = renderHook(() => useMcpServers('claude'), { wrapper: providers() });
    expect(result.current.servers).toEqual([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.servers).toEqual([]);
  });

  it('carries the failure as an AppError, and retry asks again', async () => {
    const failure = new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1');
    const get = vi.spyOn(api, 'get').mockRejectedValue(failure);

    const { result } = renderHook(() => useMcpServers('claude'), { wrapper: providers() });
    await waitFor(() => {
      expect(result.current.error).toBe(failure);
    });

    result.current.retry();
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});

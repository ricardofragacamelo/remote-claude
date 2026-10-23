import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useMarketplaces } from '@/engines/claude/settings/hooks/useMarketplaces';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMarketplaces — plan 13, B-47, B-29', () => {
  it('reads the declared marketplaces, as names', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ marketplaces: [{ name: 'official' }] });

    const { result } = renderHook(() => useMarketplaces(), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.names).toEqual(['official']);
    });
  });

  it('an empty list means the feature is off — S-212', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ marketplaces: [] });

    const { result } = renderHook(() => useMarketplaces(), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.names).toEqual([]);
  });

  it('carries the failure as an AppError, and retry asks again', async () => {
    const failure = new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1');
    const get = vi.spyOn(api, 'get').mockRejectedValue(failure);

    const { result } = renderHook(() => useMarketplaces(), { wrapper: providers() });
    await waitFor(() => {
      expect(result.current.error).toBe(failure);
    });

    result.current.retry();
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});

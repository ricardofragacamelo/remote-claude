import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useMarketplaceCatalog } from '@/engines/claude/settings/hooks/useMarketplaceCatalog';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMarketplaceCatalog — plan 13, B-47, B-29, S-212', () => {
  it('asks nothing while no marketplace is chosen', () => {
    const get = vi.spyOn(api, 'get');

    const { result } = renderHook(() => useMarketplaceCatalog(null), { wrapper: providers() });

    expect(result.current.plugins).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('reads the catalogue once a marketplace is chosen', async () => {
    const entry = { name: 'linter-pack', description: null, supported: true };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ name: 'official', plugins: [entry] });

    const { result } = renderHook(() => useMarketplaceCatalog('official'), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.plugins).toEqual([entry]);
    });
    expect(get).toHaveBeenCalledWith('/engines/claude/plugins/marketplaces/official');
  });

  it('carries the failure as an AppError, and retry asks again', async () => {
    const failure = new AppError(
      'PLUGIN_MARKETPLACE_NOT_ALLOWED',
      'engines.claude.error.pluginMarketplaceNotAllowed',
      't1',
    );
    const get = vi.spyOn(api, 'get').mockRejectedValue(failure);

    const { result } = renderHook(() => useMarketplaceCatalog('official'), {
      wrapper: providers(),
    });
    await waitFor(() => {
      expect(result.current.error).toBe(failure);
    });

    result.current.retry();
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});

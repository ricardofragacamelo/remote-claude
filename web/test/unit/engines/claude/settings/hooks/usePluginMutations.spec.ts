import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { usePluginMutations } from '@/engines/claude/settings/hooks/usePluginMutations';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

const PLUGIN_ONE = { id: 'p1', name: 'my-plugin' };
const PLUGIN_TWO = { id: 'p2', name: 'other-plugin' };

describe('usePluginMutations — plan 13, B-29', () => {
  it('adds a local plugin and answers it', async () => {
    const added = { id: 'p1', name: 'my-plugin' };
    const post = vi.spyOn(api, 'post').mockResolvedValue(added);

    const { result } = renderHook(() => usePluginMutations(), { wrapper: providers() });
    await expect(result.current.addLocal('/srv/app')).resolves.toEqual(added);
    expect(post).toHaveBeenCalledWith('/engines/claude/plugins', { path: '/srv/app' });
  });

  it('installs from a marketplace and answers it', async () => {
    const installed = { id: 'p1', name: 'linter-pack', origin: 'marketplace' };
    const post = vi.spyOn(api, 'post').mockResolvedValue(installed);

    const { result } = renderHook(() => usePluginMutations(), { wrapper: providers() });
    await expect(result.current.installFromMarketplace('official', 'linter-pack')).resolves.toEqual(
      installed,
    );
    expect(post).toHaveBeenCalledWith('/engines/claude/plugins/marketplace', {
      marketplace: 'official',
      plugin: 'linter-pack',
    });
  });

  it('applies an update by id', async () => {
    const updated = { id: 'p1', commit: 'def456' };
    const post = vi.spyOn(api, 'post').mockResolvedValue(updated);

    const { result } = renderHook(() => usePluginMutations(), { wrapper: providers() });
    await expect(result.current.applyUpdate('p1')).resolves.toEqual(updated);
    expect(post).toHaveBeenCalledWith('/engines/claude/plugins/p1/update', {});
  });

  it('turns a selection off, one PATCH per plugin — S-134', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => usePluginMutations(), { wrapper: providers() });

    const results = await act(() => result.current.setEnabled([PLUGIN_ONE, PLUGIN_TWO], false));

    expect(patch).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { ...PLUGIN_ONE, ok: true },
      { ...PLUGIN_TWO, ok: true },
    ]);
  });

  it('a plugin refused in a batch does not stop the others, and says which failed — S-134', async () => {
    const refusal = new AppError('FORBIDDEN', 'common.error.forbidden', 't1');
    vi.spyOn(api, 'patch').mockImplementation((route: string) =>
      route.endsWith('p1') ? Promise.reject(refusal) : Promise.resolve({ enabled: false }),
    );
    const { result } = renderHook(() => usePluginMutations(), { wrapper: providers() });

    const results = await act(() => result.current.setEnabled([PLUGIN_ONE, PLUGIN_TWO], false));

    expect(results).toEqual([
      { ...PLUGIN_ONE, ok: false, error: refusal },
      { ...PLUGIN_TWO, ok: true },
    ]);
  });

  it('removes a selection, one DELETE per plugin, same partial-failure contract', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    const { result } = renderHook(() => usePluginMutations(), { wrapper: providers() });

    const results = await act(() => result.current.removeMany([PLUGIN_ONE, PLUGIN_TWO]));

    expect(del).toHaveBeenCalledTimes(2);
    expect(results.every((entry) => entry.ok)).toBe(true);
  });

  it('reports saving while a write is in flight, and the last error of the five writes', async () => {
    let settle: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => usePluginMutations(), { wrapper: providers() });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.addLocal('/srv/app');
    });
    await waitFor(() => {
      expect(result.current.saving).toBe(true);
    });

    await act(async () => {
      settle({ id: 'p1' });
      await pending;
    });
    await waitFor(() => {
      expect(result.current.saving).toBe(false);
    });
  });
});

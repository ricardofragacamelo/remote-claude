import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePluginUpdateFlow } from '@/engines/claude/settings/hooks/usePluginUpdateFlow';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import type { PluginMutations } from '@/engines/claude/settings/hooks/usePluginMutations';
import type { PluginView } from '@/engines/claude/settings/types/plugin';

afterEach(() => {
  vi.restoreAllMocks();
});

const PLUGIN: PluginView = {
  id: 'p1',
  origin: 'marketplace',
  path: '/srv/plugins/linter-pack',
  marketplace: 'official',
  commit: 'abc123',
  name: 'linter-pack',
  state: 'current',
  enabled: true,
  manifest: null,
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
};

function mutationsOf(overrides: Partial<PluginMutations> = {}): PluginMutations {
  return {
    addLocal: vi.fn(),
    installFromMarketplace: vi.fn(),
    setEnabled: vi.fn(),
    removeMany: vi.fn(),
    applyUpdate: vi.fn().mockResolvedValue({ ...PLUGIN, commit: 'def456' }),
    saving: false,
    saveError: null,
    ...overrides,
  };
}

describe('usePluginUpdateFlow — plan 13, B-47, B-29, S-205', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => usePluginUpdateFlow(mutationsOf()));
    expect(result.current.state).toBeNull();
  });

  it('checking never writes anything', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ available: false, newCommit: null, diff: null });
    const mutations = mutationsOf();
    const { result } = renderHook(() => usePluginUpdateFlow(mutations));

    await act(() => result.current.check(PLUGIN));

    expect(get).toHaveBeenCalledWith('/engines/claude/plugins/p1/update');
    expect(result.current.state?.check).toEqual({ available: false, newCommit: null, diff: null });
    expect(mutations.applyUpdate).not.toHaveBeenCalled();
  });

  it('carries the check failure as an AppError', async () => {
    const failure = new AppError('FORBIDDEN', 'common.error.forbidden', 't1');
    vi.spyOn(api, 'get').mockRejectedValue(failure);
    const { result } = renderHook(() => usePluginUpdateFlow(mutationsOf()));

    await act(() => result.current.check(PLUGIN));

    expect(result.current.state?.error).toBe(failure);
    expect(result.current.state?.check).toBeNull();
  });

  it('apply with nothing checked does nothing', async () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => usePluginUpdateFlow(mutations));

    await act(() => result.current.apply());

    expect(mutations.applyUpdate).not.toHaveBeenCalled();
  });

  it('apply swaps the commit, and closes on success — S-205', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      available: true,
      newCommit: 'def456',
      diff: null,
    });
    const mutations = mutationsOf();
    const { result } = renderHook(() => usePluginUpdateFlow(mutations));

    await act(() => result.current.check(PLUGIN));
    await act(() => result.current.apply());

    expect(mutations.applyUpdate).toHaveBeenCalledWith('p1');
    expect(result.current.state).toBeNull();
  });

  it('keeps the dialog open with the error when apply fails', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ available: true, newCommit: 'def456', diff: null });
    const failure = new AppError(
      'PLUGIN_SOURCE_UNAVAILABLE',
      'engines.claude.error.pluginSourceUnavailable',
      't1',
    );
    const mutations = mutationsOf({ applyUpdate: vi.fn().mockRejectedValue(failure) });
    const { result } = renderHook(() => usePluginUpdateFlow(mutations));

    await act(() => result.current.check(PLUGIN));
    await act(() => result.current.apply());

    expect(result.current.state).not.toBeNull();
    expect(result.current.state?.error).toBe(failure);
    expect(result.current.state?.applying).toBe(false);
  });

  it('cancel closes without applying anything', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ available: false, newCommit: null, diff: null });
    const mutations = mutationsOf();
    const { result } = renderHook(() => usePluginUpdateFlow(mutations));

    await act(() => result.current.check(PLUGIN));
    act(() => {
      result.current.cancel();
    });

    expect(result.current.state).toBeNull();
    expect(mutations.applyUpdate).not.toHaveBeenCalled();
  });

  it('cancelling while the check is in flight leaves it closed once it settles', async () => {
    let settle: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'get').mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => usePluginUpdateFlow(mutationsOf()));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.check(PLUGIN);
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.state).toBeNull();

    await act(async () => {
      settle({ available: false, newCommit: null, diff: null });
      await pending;
    });
    expect(result.current.state).toBeNull();
  });

  it('cancelling while the check fails in flight leaves it closed too', async () => {
    let fail: (error: unknown) => void = () => undefined;
    vi.spyOn(api, 'get').mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const { result } = renderHook(() => usePluginUpdateFlow(mutationsOf()));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.check(PLUGIN);
    });
    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      fail(new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1'));
      await pending;
    });
    expect(result.current.state).toBeNull();
  });

  it('cancelling while the apply write is in flight leaves it closed once it settles', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ available: true, newCommit: 'def456', diff: null });
    let settle: (value: PluginView) => void = () => undefined;
    const mutations = mutationsOf({
      applyUpdate: vi.fn(
        () =>
          new Promise<PluginView>((resolve) => {
            settle = resolve;
          }),
      ),
    });
    const { result } = renderHook(() => usePluginUpdateFlow(mutations));

    await act(() => result.current.check(PLUGIN));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.apply();
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.state).toBeNull();

    await act(async () => {
      settle({ ...PLUGIN, commit: 'def456' });
      await pending;
    });
    expect(result.current.state).toBeNull();
  });

  it('cancelling while the apply write fails in flight leaves it closed too', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ available: true, newCommit: 'def456', diff: null });
    let fail: (error: unknown) => void = () => undefined;
    const mutations = mutationsOf({
      applyUpdate: vi.fn(
        () =>
          new Promise<PluginView>((_resolve, reject) => {
            fail = reject;
          }),
      ),
    });
    const { result } = renderHook(() => usePluginUpdateFlow(mutations));

    await act(() => result.current.check(PLUGIN));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.apply();
    });
    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      fail(new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1'));
      await pending;
    });
    expect(result.current.state).toBeNull();
  });
});

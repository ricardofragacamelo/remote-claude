import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useRemovePluginFlow } from '@/engines/claude/settings/hooks/useRemovePluginFlow';
import type { PluginMutations } from '@/engines/claude/settings/hooks/usePluginMutations';
import type { PluginView } from '@/engines/claude/settings/types/plugin';

const PLUGIN: PluginView = {
  id: 'p1',
  origin: 'local',
  path: '/srv/app',
  marketplace: null,
  commit: null,
  name: 'my-plugin',
  state: 'current',
  enabled: true,
  manifest: null,
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
};

function mutationsOf(removeMany: PluginMutations['removeMany']): PluginMutations {
  return {
    addLocal: vi.fn(),
    installFromMarketplace: vi.fn(),
    setEnabled: vi.fn(),
    removeMany,
    applyUpdate: vi.fn(),
    saving: false,
    saveError: null,
  };
}

describe('useRemovePluginFlow — plan 13, B-29', () => {
  it('starts with nothing to confirm', () => {
    const { result } = renderHook(() => useRemovePluginFlow(mutationsOf(vi.fn())));
    expect(result.current.targets).toBeNull();
  });

  it('ask names what would be removed, without removing anything yet', () => {
    const removeMany = vi.fn();
    const { result } = renderHook(() => useRemovePluginFlow(mutationsOf(removeMany)));

    act(() => {
      result.current.ask([PLUGIN]);
    });

    expect(result.current.targets).toEqual([PLUGIN]);
    expect(removeMany).not.toHaveBeenCalled();
  });

  it('confirm removes every target, and clears the question on success', async () => {
    const removeMany = vi.fn().mockResolvedValue([{ id: 'p1', name: 'my-plugin', ok: true }]);
    const { result } = renderHook(() => useRemovePluginFlow(mutationsOf(removeMany)));

    act(() => {
      result.current.ask([PLUGIN]);
    });
    const results = await act(() => result.current.confirm());

    expect(removeMany).toHaveBeenCalledWith([PLUGIN]);
    expect(results).toEqual([{ id: 'p1', name: 'my-plugin', ok: true }]);
    expect(result.current.targets).toBeNull();
  });

  it('confirm with nothing asked does nothing', async () => {
    const removeMany = vi.fn();
    const { result } = renderHook(() => useRemovePluginFlow(mutationsOf(removeMany)));

    const results = await act(() => result.current.confirm());

    expect(results).toEqual([]);
    expect(removeMany).not.toHaveBeenCalled();
  });

  it('is pending while the removal is in flight, then settles', async () => {
    let settle: (value: unknown) => void = () => undefined;
    const removeMany = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => useRemovePluginFlow(mutationsOf(removeMany)));

    act(() => {
      result.current.ask([PLUGIN]);
    });
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.confirm();
    });
    await waitFor(() => {
      expect(result.current.pending).toBe(true);
    });

    await act(async () => {
      settle([]);
      await pending;
    });
    expect(result.current.pending).toBe(false);
  });

  it('cancel clears the question', () => {
    const { result } = renderHook(() => useRemovePluginFlow(mutationsOf(vi.fn())));

    act(() => {
      result.current.ask([PLUGIN]);
      result.current.cancel();
    });

    expect(result.current.targets).toBeNull();
  });

  it('cancel does nothing while a removal is pending — no closing mid-request', async () => {
    let settle: (value: unknown) => void = () => undefined;
    const removeMany = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => useRemovePluginFlow(mutationsOf(removeMany)));

    act(() => {
      result.current.ask([PLUGIN]);
    });
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.confirm();
    });
    await waitFor(() => {
      expect(result.current.pending).toBe(true);
    });

    act(() => {
      result.current.cancel();
    });
    expect(result.current.targets).toEqual([PLUGIN]);

    await act(async () => {
      settle([]);
      await pending;
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useInstallMarketplaceFlow } from '@/engines/claude/settings/hooks/useInstallMarketplaceFlow';
import { AppError } from '@/shared/api/errors';
import type { PluginMutations } from '@/engines/claude/settings/hooks/usePluginMutations';
import type { MarketplaceCatalogEntry, PluginView } from '@/engines/claude/settings/types/plugin';

const ENTRY: MarketplaceCatalogEntry = {
  name: 'linter-pack',
  description: 'Lints the repository.',
  supported: true,
};

const INSTALLED: PluginView = {
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
    installFromMarketplace: vi.fn().mockResolvedValue(INSTALLED),
    setEnabled: vi.fn(),
    removeMany: vi.fn(),
    applyUpdate: vi.fn(),
    saving: false,
    saveError: null,
    ...overrides,
  };
}

describe('useInstallMarketplaceFlow — plan 13, B-47, B-29, S-212', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useInstallMarketplaceFlow(mutationsOf()));
    expect(result.current.state).toBeNull();
  });

  it('ask opens the confirm with the chosen entry, without installing yet', () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useInstallMarketplaceFlow(mutations));

    act(() => {
      result.current.ask('official', ENTRY);
    });

    expect(result.current.state).toMatchObject({ marketplace: 'official', entry: ENTRY });
    expect(mutations.installFromMarketplace).not.toHaveBeenCalled();
  });

  it('confirm installs, and closes on success — D-90', async () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useInstallMarketplaceFlow(mutations));

    act(() => {
      result.current.ask('official', ENTRY);
    });
    await act(() => result.current.confirm());

    expect(mutations.installFromMarketplace).toHaveBeenCalledWith('official', 'linter-pack');
    expect(result.current.state).toBeNull();
  });

  it('confirm with nothing asked does nothing', async () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useInstallMarketplaceFlow(mutations));

    await act(() => result.current.confirm());

    expect(mutations.installFromMarketplace).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the error when install fails', async () => {
    const failure = new AppError(
      'PLUGIN_SOURCE_UNAVAILABLE',
      'engines.claude.error.pluginSourceUnavailable',
      't1',
    );
    const mutations = mutationsOf({
      installFromMarketplace: vi.fn().mockRejectedValue(failure),
    });
    const { result } = renderHook(() => useInstallMarketplaceFlow(mutations));

    act(() => {
      result.current.ask('official', ENTRY);
    });
    await act(() => result.current.confirm());

    expect(result.current.state).not.toBeNull();
    expect(result.current.state?.error).toBe(failure);
    expect(result.current.state?.installing).toBe(false);
  });

  it('cancelling while the install is in flight leaves it closed once it settles', async () => {
    let settle: (value: PluginView) => void = () => undefined;
    const mutations = mutationsOf({
      installFromMarketplace: vi.fn(
        () =>
          new Promise<PluginView>((resolve) => {
            settle = resolve;
          }),
      ),
    });
    const { result } = renderHook(() => useInstallMarketplaceFlow(mutations));

    act(() => {
      result.current.ask('official', ENTRY);
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.confirm();
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.state).toBeNull();

    await act(async () => {
      settle(INSTALLED);
      await pending;
    });
    expect(result.current.state).toBeNull();
  });

  it('cancelling while the install fails in flight leaves it closed too', async () => {
    let fail: (error: unknown) => void = () => undefined;
    const mutations = mutationsOf({
      installFromMarketplace: vi.fn(
        () =>
          new Promise<PluginView>((_resolve, reject) => {
            fail = reject;
          }),
      ),
    });
    const { result } = renderHook(() => useInstallMarketplaceFlow(mutations));

    act(() => {
      result.current.ask('official', ENTRY);
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.confirm();
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

  it('cancel closes the dialog without installing', () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useInstallMarketplaceFlow(mutations));

    act(() => {
      result.current.ask('official', ENTRY);
      result.current.cancel();
    });

    expect(result.current.state).toBeNull();
    expect(mutations.installFromMarketplace).not.toHaveBeenCalled();
  });
});

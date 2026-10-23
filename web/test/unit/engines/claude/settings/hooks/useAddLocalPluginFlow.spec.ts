import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useAddLocalPluginFlow } from '@/engines/claude/settings/hooks/useAddLocalPluginFlow';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import type { PluginMutations } from '@/engines/claude/settings/hooks/usePluginMutations';
import type { PluginView } from '@/engines/claude/settings/types/plugin';

afterEach(() => {
  vi.restoreAllMocks();
});

const ADDED: PluginView = {
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

function mutationsOf(overrides: Partial<PluginMutations> = {}): PluginMutations {
  return {
    addLocal: vi.fn().mockResolvedValue(ADDED),
    installFromMarketplace: vi.fn(),
    setEnabled: vi.fn(),
    removeMany: vi.fn(),
    applyUpdate: vi.fn(),
    saving: false,
    saveError: null,
    ...overrides,
  };
}

describe('useAddLocalPluginFlow — plan 13, B-29, S-125, S-137', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useAddLocalPluginFlow(mutationsOf()));
    expect(result.current.state).toBeNull();
  });

  it('opens empty, on the form step', () => {
    const { result } = renderHook(() => useAddLocalPluginFlow(mutationsOf()));

    act(() => {
      result.current.start();
    });

    expect(result.current.state).toMatchObject({ step: 'form', path: '' });
  });

  it('setPath updates the draft and clears a previous issue', () => {
    const { result } = renderHook(() => useAddLocalPluginFlow(mutationsOf()));

    act(() => {
      result.current.start();
      result.current.setPath('/srv/app');
    });

    expect(result.current.state?.path).toBe('/srv/app');
  });

  it('flags an empty path on toPreview, without asking the server', async () => {
    const post = vi.spyOn(api, 'post');
    const { result } = renderHook(() => useAddLocalPluginFlow(mutationsOf()));

    act(() => {
      result.current.start();
    });
    await act(() => result.current.toPreview());

    expect(result.current.state?.step).toBe('form');
    expect(result.current.state?.pathIssue).toBe('engines.claude.plugins.issuePathRequired');
    expect(post).not.toHaveBeenCalled();
  });

  it('moves to the preview step once the manifest answers — S-125', async () => {
    const preview = {
      manifest: { name: 'my-plugin' },
      messageKey: 'engines.claude.plugin.descriptionLocal',
      params: { name: 'my-plugin' },
    };
    vi.spyOn(api, 'post').mockResolvedValue(preview);
    const { result } = renderHook(() => useAddLocalPluginFlow(mutationsOf()));

    act(() => {
      result.current.start();
      result.current.setPath('/srv/app');
    });
    await act(() => result.current.toPreview());

    expect(result.current.state?.step).toBe('preview');
    expect(result.current.state?.preview).toEqual(preview);
  });

  it('keeps the previewError on the form step when the server refuses it', async () => {
    const failure = new AppError(
      'PLUGIN_PATH_INVALID',
      'engines.claude.error.pluginPathInvalid',
      't1',
    );
    vi.spyOn(api, 'post').mockRejectedValue(failure);
    const { result } = renderHook(() => useAddLocalPluginFlow(mutationsOf()));

    act(() => {
      result.current.start();
      result.current.setPath('/srv/app');
    });
    await act(() => result.current.toPreview());

    expect(result.current.state?.step).toBe('form');
    expect(result.current.state?.previewError).toBe(failure);
  });

  it('goes back to the form, keeping the draft', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      manifest: { name: 'my-plugin' },
      messageKey: 'engines.claude.plugin.descriptionLocal',
      params: {},
    });
    const { result } = renderHook(() => useAddLocalPluginFlow(mutationsOf()));

    act(() => {
      result.current.start();
      result.current.setPath('/srv/app');
    });
    await act(() => result.current.toPreview());

    act(() => {
      result.current.back();
    });

    expect(result.current.state?.step).toBe('form');
    expect(result.current.state?.path).toBe('/srv/app');
  });

  it('confirm adds the plugin, and closes on success', async () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useAddLocalPluginFlow(mutations));

    act(() => {
      result.current.start();
      result.current.setPath('/srv/app');
    });
    await act(() => result.current.confirm());

    expect(mutations.addLocal).toHaveBeenCalledWith('/srv/app');
    expect(result.current.state).toBeNull();
  });

  it('keeps the dialog open with the save error when the write fails', async () => {
    const failure = new AppError(
      'PLUGIN_PATH_INVALID',
      'engines.claude.error.pluginPathInvalid',
      't1',
    );
    const mutations = mutationsOf({ addLocal: vi.fn().mockRejectedValue(failure) });
    const { result } = renderHook(() => useAddLocalPluginFlow(mutations));

    act(() => {
      result.current.start();
      result.current.setPath('/srv/app');
    });
    await act(() => result.current.confirm());

    expect(result.current.state).not.toBeNull();
    expect(result.current.state?.saveError).toBe(failure);
  });

  it('cancel closes the dialog without saving', () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useAddLocalPluginFlow(mutations));

    act(() => {
      result.current.start();
      result.current.cancel();
    });

    expect(result.current.state).toBeNull();
    expect(mutations.addLocal).not.toHaveBeenCalled();
  });

  it('does nothing when asked to act with no dialog open', async () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useAddLocalPluginFlow(mutations));

    await act(() => result.current.toPreview());
    act(() => {
      result.current.back();
    });
    await act(() => result.current.confirm());

    expect(result.current.state).toBeNull();
    expect(mutations.addLocal).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { KeepAgentNames } from '@/features/session';
import { useAgentName, useEngines } from '@/features/session/hooks/useEngines';
import { api } from '@/shared/api/api';
import { createI18n, nameAgents } from '@/shared/i18n';
import { anEngineList, OTHER_ENGINE, OTHER_ENGINE_NAME } from '../../../../support/engines';
import { providers, render, translator } from '../../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  nameAgents(null);
});

describe('the engines of the installation — plan 28, B-13', () => {
  it('reads them once, and names an engine as the server does', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(anEngineList());
    const { result } = renderHook(() => useEngines(), { wrapper: providers() });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.nameOf(OTHER_ENGINE)).toBe(OTHER_ENGINE_NAME);
    expect(result.current.nameOf('unlisted')).toBe('unlisted');
    // No engine named: the default one's name.
    expect(result.current.nameOf(null)).toBe('Claude');
  });

  it('names an engine by its id while the list is not there, and says why it is not', async () => {
    const refusal = { code: 'NETWORK_UNREACHABLE', messageKey: 'common.error.offline' };
    vi.spyOn(api, 'get').mockRejectedValue(refusal);
    const { result } = renderHook(() => useEngines(), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.error).toBe(refusal);
    });
    expect(result.current.directory).toBeNull();
    expect(result.current.nameOf('claude')).toBe('claude');
    expect(result.current.nameOf(null)).toBe(t('engine.name.fallback'));
  });

  it('names one engine — the agent of a text', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(anEngineList());
    const { result } = renderHook(() => useAgentName(OTHER_ENGINE), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current).toBe(OTHER_ENGINE_NAME);
    });
  });

  it('keeps the names where every translation finds them, for the errors of every screen — S-26', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(anEngineList());
    const error = {
      messageKey: 'session.error.agentUnavailable',
      params: { engine: OTHER_ENGINE },
    };

    render(<KeepAgentNames />);

    await waitFor(() => {
      expect(createI18n('en').t(error.messageKey, error.params)).toBe(
        `${OTHER_ENGINE_NAME} stopped responding on this machine.`,
      );
    });
  });
});

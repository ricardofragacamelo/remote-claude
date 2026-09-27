import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useCommandMenu } from '@/features/session/hooks/useCommandMenu';
import { providers } from '../../../../support/render';
import {
  aCommandDto,
  aCommandMenu,
  aWireError,
  routeApi,
  SESSION,
} from '../../../../support/session-tools';

const PATH = `/sessions/${SESSION}/commands`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCommandMenu — plan 04, B-15', () => {
  it('loads the menu, then hands it over in its two groups', async () => {
    routeApi({ [PATH]: [aCommandMenu()] });
    const { result } = renderHook(() => useCommandMenu(SESSION, ''), { wrapper: providers() });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.suggested.map((command) => command.name)).toEqual(['init', 'review']);
    expect(result.current.others.map((command) => command.name)).toEqual(['compact', 'cost']);
    expect(result.current.cliVersion).toBe('2.1.277');
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('searches without asking again', async () => {
    const get = routeApi({ [PATH]: [aCommandMenu()] });
    const { result, rerender } = renderHook(({ search }) => useCommandMenu(SESSION, search), {
      wrapper: providers(),
      initialProps: { search: '' },
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    rerender({ search: 'squash' });

    expect(result.current.suggested).toEqual([]);
    expect(result.current.others.map((command) => command.name)).toEqual(['compact']);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('tells an installation with no command from a search that found none', async () => {
    routeApi({ [PATH]: [aCommandMenu([], null)] });
    const { result } = renderHook(() => useCommandMenu(SESSION, 'x'), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.isEmpty).toBe(true);
    });
    expect(result.current.cliVersion).toBeNull();
  });

  it('says why the menu is down, and asks again on retry — S-31', async () => {
    routeApi({
      [PATH]: [
        aWireError('CLAUDE_TIMEOUT', 'session.error.claudeTimeout'),
        aCommandMenu([aCommandDto('cost')]),
      ],
    });
    const { result } = renderHook(() => useCommandMenu(SESSION, ''), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({ code: 'CLAUDE_TIMEOUT' });
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.others.map((command) => command.name)).toEqual(['cost']);
    });
    expect(result.current.error).toBeNull();
  });
});

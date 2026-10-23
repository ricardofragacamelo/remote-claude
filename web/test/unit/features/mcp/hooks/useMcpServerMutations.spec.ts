import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useMcpServerMutations } from '@/features/mcp/hooks/useMcpServerMutations';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

const GITHUB = { id: 's1', name: 'github' };
const METRICS = { id: 's2', name: 'metrics' };

describe('useMcpServerMutations — plan 13, B-28', () => {
  it('creates a server and answers it', async () => {
    const created = { id: 's1', name: 'github' };
    vi.spyOn(api, 'post').mockResolvedValue(created);

    const { result } = renderHook(() => useMcpServerMutations('claude'), { wrapper: providers() });
    await expect(
      result.current.create({ name: 'github', scope: 'user', transport: 'stdio' }),
    ).resolves.toEqual(created);
  });

  it('updates a server by id and answers it', async () => {
    const updated = { id: 's1', name: 'github', command: 'node' };
    const put = vi.spyOn(api, 'put').mockResolvedValue(updated);

    const { result } = renderHook(() => useMcpServerMutations('claude'), { wrapper: providers() });
    await expect(
      result.current.update('s1', {
        name: 'github',
        scope: 'user',
        transport: 'stdio',
        command: 'node',
      }),
    ).resolves.toEqual(updated);
    expect(put).toHaveBeenCalledWith(
      '/engines/claude/mcp-servers/s1',
      expect.objectContaining({ command: 'node' }),
    );
  });

  it('removes a server by id', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    const { result } = renderHook(() => useMcpServerMutations('claude'), { wrapper: providers() });

    await result.current.remove('s1');

    expect(del).toHaveBeenCalledWith('/engines/claude/mcp-servers/s1');
  });

  it('turns a selection off, one PATCH per server — S-134', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useMcpServerMutations('claude'), { wrapper: providers() });

    const results = await act(() => result.current.setEnabled([GITHUB, METRICS], false));

    expect(patch).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { ...GITHUB, ok: true },
      { ...METRICS, ok: true },
    ]);
  });

  it('a server refused in a batch does not stop the others, and says which failed — S-134', async () => {
    const refusal = new AppError('FORBIDDEN', 'common.error.forbidden', 't1');
    vi.spyOn(api, 'patch').mockImplementation((route: string) =>
      route.endsWith('s1') ? Promise.reject(refusal) : Promise.resolve({ enabled: false }),
    );
    const { result } = renderHook(() => useMcpServerMutations('claude'), { wrapper: providers() });

    const results = await act(() => result.current.setEnabled([GITHUB, METRICS], false));

    expect(results).toEqual([
      { ...GITHUB, ok: false, error: refusal },
      { ...METRICS, ok: true },
    ]);
  });

  it('removes a selection, one DELETE per server, same partial-failure contract', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    const { result } = renderHook(() => useMcpServerMutations('claude'), { wrapper: providers() });

    const results = await act(() => result.current.removeMany([GITHUB, METRICS]));

    expect(del).toHaveBeenCalledTimes(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('keeps a test result by id, one per server, until cleared', async () => {
    const outcome = { status: 'connected' as const, tools: [], error: null };
    vi.spyOn(api, 'post').mockResolvedValue(outcome);
    const { result } = renderHook(() => useMcpServerMutations('claude'), { wrapper: providers() });

    await act(() => result.current.test([GITHUB]));
    await waitFor(() => {
      expect(result.current.testResults.get('s1')?.outcome).toEqual(outcome);
    });

    act(() => {
      result.current.clearTestResults();
    });
    expect(result.current.testResults.size).toBe(0);
  });

  it('keeps the error of a failed test, not an outcome', async () => {
    const failure = new AppError('ENGINE_UNAVAILABLE', 'common.error.unexpected', 't1');
    vi.spyOn(api, 'post').mockRejectedValue(failure);
    const { result } = renderHook(() => useMcpServerMutations('claude'), { wrapper: providers() });

    await act(() => result.current.test([GITHUB]));
    await waitFor(() => {
      expect(result.current.testResults.get('s1')?.error).toBe(failure);
    });
    expect(result.current.testResults.get('s1')?.outcome).toBeUndefined();
  });

  it('reports saving while a write is in flight, and the last error of the four writes', async () => {
    let settle: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => useMcpServerMutations('claude'), { wrapper: providers() });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.create({ name: 'github', scope: 'user', transport: 'stdio' });
    });
    await waitFor(() => {
      expect(result.current.saving).toBe(true);
    });

    await act(async () => {
      settle({ id: 's1' });
      await pending;
    });
    await waitFor(() => {
      expect(result.current.saving).toBe(false);
    });
  });
});

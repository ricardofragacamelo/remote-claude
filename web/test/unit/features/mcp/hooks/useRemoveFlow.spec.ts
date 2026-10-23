import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useRemoveFlow } from '@/features/mcp/hooks/useRemoveFlow';
import type { McpServerMutations } from '@/features/mcp/hooks/useMcpServerMutations';
import type { McpServerView } from '@/features/mcp/types/mcp';

const SERVER: McpServerView = {
  id: 's1',
  name: 'github',
  scope: 'user',
  folderPath: null,
  transport: 'stdio',
  command: 'npx',
  args: [],
  envNames: [],
  url: null,
  headerNames: [],
  enabled: true,
  status: 'pending',
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
};

function mutationsOf(removeMany: McpServerMutations['removeMany']): McpServerMutations {
  return {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setEnabled: vi.fn(),
    removeMany,
    test: vi.fn(),
    testResults: new Map(),
    clearTestResults: vi.fn(),
    saving: false,
    saveError: null,
  };
}

describe('useRemoveFlow — plan 13, B-28, S-135', () => {
  it('starts with nothing to confirm', () => {
    const { result } = renderHook(() => useRemoveFlow(mutationsOf(vi.fn())));
    expect(result.current.targets).toBeNull();
  });

  it('ask names what would be removed, without removing anything yet', () => {
    const removeMany = vi.fn();
    const { result } = renderHook(() => useRemoveFlow(mutationsOf(removeMany)));

    act(() => {
      result.current.ask([SERVER]);
    });

    expect(result.current.targets).toEqual([SERVER]);
    expect(removeMany).not.toHaveBeenCalled();
  });

  it('confirm removes every target, and clears the question on success', async () => {
    const removeMany = vi.fn().mockResolvedValue([{ id: 's1', name: 'github', ok: true }]);
    const { result } = renderHook(() => useRemoveFlow(mutationsOf(removeMany)));

    act(() => {
      result.current.ask([SERVER]);
    });
    const results = await act(() => result.current.confirm());

    expect(removeMany).toHaveBeenCalledWith([SERVER]);
    expect(results).toEqual([{ id: 's1', name: 'github', ok: true }]);
    expect(result.current.targets).toBeNull();
  });

  it('confirm with nothing asked does nothing', async () => {
    const removeMany = vi.fn();
    const { result } = renderHook(() => useRemoveFlow(mutationsOf(removeMany)));

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
    const { result } = renderHook(() => useRemoveFlow(mutationsOf(removeMany)));

    act(() => {
      result.current.ask([SERVER]);
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
    const { result } = renderHook(() => useRemoveFlow(mutationsOf(vi.fn())));

    act(() => {
      result.current.ask([SERVER]);
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
    const { result } = renderHook(() => useRemoveFlow(mutationsOf(removeMany)));

    act(() => {
      result.current.ask([SERVER]);
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
    expect(result.current.targets).toEqual([SERVER]);

    await act(async () => {
      settle([]);
      await pending;
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useBatchRemoveFlow } from '@/shared/hooks/useBatchRemoveFlow';

const A = { id: 'a', name: 'alpha' };

describe('useBatchRemoveFlow', () => {
  it('starts with nothing to confirm', () => {
    const { result } = renderHook(() => useBatchRemoveFlow(vi.fn()));
    expect(result.current.targets).toBeNull();
  });

  it('ask names what would be removed, without removing anything yet', () => {
    const removeMany = vi.fn();
    const { result } = renderHook(() => useBatchRemoveFlow(removeMany));

    act(() => {
      result.current.ask([A]);
    });

    expect(result.current.targets).toEqual([A]);
    expect(removeMany).not.toHaveBeenCalled();
  });

  it('confirm removes every target, and clears the question on success', async () => {
    const removeMany = vi.fn().mockResolvedValue([{ ...A, ok: true }]);
    const { result } = renderHook(() => useBatchRemoveFlow(removeMany));

    act(() => {
      result.current.ask([A]);
    });
    const results = await act(() => result.current.confirm());

    expect(removeMany).toHaveBeenCalledWith([A]);
    expect(results).toEqual([{ ...A, ok: true }]);
    expect(result.current.targets).toBeNull();
  });

  it('confirm with nothing asked does nothing', async () => {
    const removeMany = vi.fn();
    const { result } = renderHook(() => useBatchRemoveFlow(removeMany));

    expect(await act(() => result.current.confirm())).toEqual([]);
    expect(removeMany).not.toHaveBeenCalled();
  });

  it('is pending while the removal is in flight, then settles', async () => {
    let settle: (value: unknown) => void = () => undefined;
    const removeMany = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => useBatchRemoveFlow(removeMany));

    act(() => {
      result.current.ask([A]);
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
    const { result } = renderHook(() => useBatchRemoveFlow(vi.fn()));

    act(() => {
      result.current.ask([A]);
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
    const { result } = renderHook(() => useBatchRemoveFlow(removeMany));

    act(() => {
      result.current.ask([A]);
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
    expect(result.current.targets).toEqual([A]);

    await act(async () => {
      settle([]);
      await pending;
    });
  });
});

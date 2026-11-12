import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useApplyImport } from '@/features/permission/hooks/useApplyImport';
import type { ApplyRuleImportInput } from '@/features/permission/types/rule';
import { api } from '@/shared/api/api';

const input: ApplyRuleImportInput = {
  file: '{}',
  digest: 'sha-1',
  accept: [0],
};

describe('useApplyImport — "Modelos"’s own one write (plan 15, B-30)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts idle, with nothing submitting and no error', () => {
    const { result } = renderHook(() => useApplyImport());

    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('flips submitting around a resolved call, and resolves to the result', async () => {
    const applied = { counts: { created: 1, existing: 0 }, rules: [] };
    vi.spyOn(api, 'post').mockResolvedValue(applied);
    const { result } = renderHook(() => useApplyImport());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.apply(input);
    });

    expect(returned).toEqual(applied);
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(api.post).toHaveBeenCalledWith('/permission-rules/import', input);
  });

  it('reports submitting while the call is in flight', async () => {
    let resolveCall: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve;
      }),
    );
    const { result } = renderHook(() => useApplyImport());

    let pending: Promise<unknown> = Promise.resolve(null);
    act(() => {
      pending = result.current.apply(input);
    });

    await waitFor(() => {
      expect(result.current.submitting).toBe(true);
    });

    await act(async () => {
      resolveCall({ counts: { created: 0, existing: 1 }, rules: [] });
      await pending;
    });

    expect(result.current.submitting).toBe(false);
  });

  it('flips submitting back and resolves to null on a rejected call, with the error kept', async () => {
    const error = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} };
    vi.spyOn(api, 'post').mockRejectedValue(error);
    const { result } = renderHook(() => useApplyImport());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.apply(input);
    });

    expect(returned).toBeNull();
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toEqual(error);
  });

  it('clears the previous error at the start of the next attempt', async () => {
    const error = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} };
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        counts: { created: 1, existing: 0 },
        rules: [],
      });
    const { result } = renderHook(() => useApplyImport());

    await act(async () => {
      await result.current.apply(input);
    });
    expect(result.current.error).toEqual(error);

    await act(async () => {
      await result.current.apply(input);
    });

    expect(result.current.error).toBeNull();
    expect(post).toHaveBeenCalledTimes(2);
  });
});

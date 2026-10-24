import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useSkillMutations } from '@/engines/claude/settings/hooks/useSkillMutations';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSkillMutations — plan 13, B-34', () => {
  it('puts the whole value for the folder, and answers it', async () => {
    const saved = { sources: { user: true }, disabledSkills: [] };
    const put = vi.spyOn(api, 'put').mockResolvedValue(saved);

    const { result } = renderHook(() => useSkillMutations('/srv/app'), { wrapper: providers() });
    await expect(
      result.current.save({ sources: { user: true }, disabledSkills: [] }),
    ).resolves.toEqual(saved);

    expect(put).toHaveBeenCalledWith('/engines/claude/skills/preferences', {
      folder: '/srv/app',
      sources: { user: true },
      disabledSkills: [],
    });
  });

  it('carries the failure of a save as an AppError', async () => {
    const failure = new AppError('INVALID_INPUT', 'common.error.unexpected', 't1');
    vi.spyOn(api, 'put').mockRejectedValue(failure);

    const { result } = renderHook(() => useSkillMutations('/srv/app'), { wrapper: providers() });
    await expect(result.current.save({ sources: {}, disabledSkills: [] })).rejects.toThrow();

    await waitFor(() => {
      expect(result.current.saveError).toBe(failure);
    });
  });

  it('still invalidates by a well-formed key with no folder chosen', async () => {
    const saved = { sources: {}, disabledSkills: [] };
    vi.spyOn(api, 'put').mockResolvedValue(saved);

    const { result } = renderHook(() => useSkillMutations(undefined), { wrapper: providers() });
    await expect(result.current.save({ sources: {}, disabledSkills: [] })).resolves.toEqual(saved);

    await waitFor(() => {
      expect(result.current.saving).toBe(false);
    });
  });

  it('reports saving while the write is in flight', async () => {
    let settle: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'put').mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => useSkillMutations('/srv/app'), { wrapper: providers() });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.save({ sources: {}, disabledSkills: [] });
    });
    await waitFor(() => {
      expect(result.current.saving).toBe(true);
    });

    await act(async () => {
      settle({ sources: {}, disabledSkills: [] });
      await pending;
    });
    await waitFor(() => {
      expect(result.current.saving).toBe(false);
    });
  });
});

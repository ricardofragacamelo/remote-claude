import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useSkills } from '@/engines/claude/settings/hooks/useSkills';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSkills — plan 13, B-34', () => {
  it('asks nothing, and reports neither loading nor an error, with no folder chosen', () => {
    const get = vi.spyOn(api, 'get');

    const { result } = renderHook(() => useSkills(undefined), { wrapper: providers() });

    expect(result.current.skills).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('reads the folder once one is chosen, unwrapped', async () => {
    const skill = { name: 'review', origin: 'project' };
    vi.spyOn(api, 'get').mockResolvedValue({ skills: [skill] });

    const { result } = renderHook(() => useSkills('/srv/app'), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.skills).toEqual([skill]);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('carries the failure as an AppError, and retry asks again', async () => {
    const failure = new AppError('WORKSPACE_NOT_ALLOWED', 'common.error.unexpected', 't1');
    const get = vi.spyOn(api, 'get').mockRejectedValue(failure);

    const { result } = renderHook(() => useSkills('/srv/app'), { wrapper: providers() });
    await waitFor(() => {
      expect(result.current.error).toBe(failure);
    });

    result.current.retry();
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});

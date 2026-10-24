import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useSkillPreferences } from '@/engines/claude/settings/hooks/useSkillPreferences';
import { EMPTY_SKILL_PREFERENCES } from '@/engines/claude/settings/types/skill';
import { api } from '@/shared/api/api';
import { providers } from '../../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSkillPreferences — D-108, D-109', () => {
  it('is the safety default with no folder chosen, and asks nothing', () => {
    const get = vi.spyOn(api, 'get');

    const { result } = renderHook(() => useSkillPreferences(undefined), { wrapper: providers() });

    expect(result.current.value).toEqual(EMPTY_SKILL_PREFERENCES);
    expect(get).not.toHaveBeenCalled();
  });

  it('reads the effective value of the folder, not the user’s or the folder’s own alone', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      effective: { value: { sources: { user: true }, disabledSkills: ['a'] }, from: 'user' },
      user: { sources: { user: true }, disabledSkills: ['a'] },
      folder: null,
    });

    const { result } = renderHook(() => useSkillPreferences('/srv/app'), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.value).toEqual({ sources: { user: true }, disabledSkills: ['a'] });
    });
    expect(result.current.isLoading).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSkillToggleFlow } from '@/engines/claude/settings/hooks/useSkillToggleFlow';
import type { SkillMutations } from '@/engines/claude/settings/hooks/useSkillMutations';
import type { SkillPreferencesValue, SkillView } from '@/engines/claude/settings/types/skill';

const SKILLS: readonly SkillView[] = [
  {
    name: 'review',
    origin: 'user',
    description: '',
    sourceFile: null,
    enabled: false,
    unloadedReason: null,
  },
];

function fakeMutations(): SkillMutations & { readonly saved: SkillPreferencesValue[] } {
  const saved: SkillPreferencesValue[] = [];
  return {
    saved,
    save: (preferences) => {
      saved.push(preferences);
      return Promise.resolve(preferences);
    },
    saving: false,
    saveError: null,
  };
}

describe('useSkillToggleFlow — plan 13, B-34, D-20', () => {
  it('saves at once, turning a skill off', () => {
    const mutations = fakeMutations();
    const { result } = renderHook(() =>
      useSkillToggleFlow({ sources: {}, disabledSkills: [] }, SKILLS, mutations),
    );

    act(() => {
      result.current.toggleSkills(['remote-claude-user:review'], false);
    });

    expect(mutations.saved).toEqual([
      { sources: {}, disabledSkills: ['remote-claude-user:review'] },
    ]);
  });

  it('turning an origin off saves at once, no confirm opened', () => {
    const mutations = fakeMutations();
    const { result } = renderHook(() =>
      useSkillToggleFlow({ sources: { user: true }, disabledSkills: [] }, SKILLS, mutations),
    );

    act(() => {
      result.current.toggleOrigin('user', false);
    });

    expect(mutations.saved).toEqual([{ sources: { user: false }, disabledSkills: [] }]);
    expect(result.current.pendingOrigin).toBeNull();
  });

  it('turning an origin on opens a confirm first, saving nothing yet — S-182', () => {
    const mutations = fakeMutations();
    const { result } = renderHook(() =>
      useSkillToggleFlow({ sources: {}, disabledSkills: [] }, SKILLS, mutations),
    );

    act(() => {
      result.current.toggleOrigin('user', true);
    });

    expect(mutations.saved).toEqual([]);
    expect(result.current.pendingOrigin).toBe('user');
    expect(result.current.aboutToLoad).toEqual(SKILLS);
  });

  it('confirming the pending origin saves it, and closes the confirm', () => {
    const mutations = fakeMutations();
    const { result } = renderHook(() =>
      useSkillToggleFlow({ sources: {}, disabledSkills: [] }, SKILLS, mutations),
    );

    act(() => {
      result.current.toggleOrigin('user', true);
    });
    act(() => {
      result.current.confirmEnableOrigin();
    });

    expect(mutations.saved).toEqual([{ sources: { user: true }, disabledSkills: [] }]);
    expect(result.current.pendingOrigin).toBeNull();
  });

  it('cancelling the confirm saves nothing, and closes it', () => {
    const mutations = fakeMutations();
    const { result } = renderHook(() =>
      useSkillToggleFlow({ sources: {}, disabledSkills: [] }, SKILLS, mutations),
    );

    act(() => {
      result.current.toggleOrigin('user', true);
    });
    act(() => {
      result.current.cancelEnableOrigin();
    });

    expect(mutations.saved).toEqual([]);
    expect(result.current.pendingOrigin).toBeNull();
  });

  it('confirming with nothing pending saves nothing — never called mid-render by accident', () => {
    const mutations = fakeMutations();
    const { result } = renderHook(() =>
      useSkillToggleFlow({ sources: {}, disabledSkills: [] }, SKILLS, mutations),
    );

    act(() => {
      result.current.confirmEnableOrigin();
    });

    expect(mutations.saved).toEqual([]);
  });

  it('reflects the mutations’ own busy and error state', () => {
    const save = vi.fn();
    const mutations: SkillMutations = { save, saving: true, saveError: null };
    const { result } = renderHook(() =>
      useSkillToggleFlow({ sources: {}, disabledSkills: [] }, SKILLS, mutations),
    );

    expect(result.current.busy).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { skillRowActions } from '@/engines/claude/settings/lib/skill-row-actions';
import type { SkillView } from '@/engines/claude/settings/types/skill';

function aSkill(overrides: Partial<SkillView> = {}): SkillView {
  return {
    name: 'review',
    origin: 'project',
    description: 'Reviews a PR',
    sourceFile: '.claude/skills/review/SKILL.md',
    enabled: true,
    unloadedReason: null,
    ...overrides,
  };
}

describe('skillRowActions — plan 13, B-39', () => {
  it('offers to turn an enabled skill off', () => {
    const onToggleSkill = vi.fn();
    const actions = skillRowActions(aSkill({ enabled: true }), '/srv/app', {
      onToggleSkill,
      openInEditor: vi.fn(),
    });

    const turnOff = actions.find((action) => action.id === 'skill.turnOff');
    expect(turnOff).toBeDefined();
    turnOff?.run();
    expect(onToggleSkill).toHaveBeenCalledWith(expect.objectContaining({ name: 'review' }), false);
  });

  it('offers to turn a disabled skill on', () => {
    const onToggleSkill = vi.fn();
    const actions = skillRowActions(aSkill({ enabled: false }), '/srv/app', {
      onToggleSkill,
      openInEditor: vi.fn(),
    });

    const turnOn = actions.find((action) => action.id === 'skill.turnOn');
    expect(turnOn).toBeDefined();
    turnOn?.run();
    expect(onToggleSkill).toHaveBeenCalledWith(expect.objectContaining({ name: 'review' }), true);
  });

  it("opens a project skill's own file, at its folder", () => {
    const openInEditor = vi.fn();
    const actions = skillRowActions(
      aSkill({ sourceFile: '.claude/skills/review/SKILL.md' }),
      '/srv/app',
      { onToggleSkill: vi.fn(), openInEditor },
    );

    const open = actions.find((action) => action.id === 'skill.openInEditor');
    expect(open).toBeDefined();
    open?.run();
    expect(openInEditor).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('.claude/skills/review/SKILL.md')),
    );
  });

  it('offers nothing to open for a skill outside this folder’s reach — D-20', () => {
    const actions = skillRowActions(aSkill({ sourceFile: null }), '/srv/app', {
      onToggleSkill: vi.fn(),
      openInEditor: vi.fn(),
    });

    expect(actions.find((action) => action.id === 'skill.openInEditor')).toBeUndefined();
  });
});

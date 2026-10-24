import type { SkillView, ToggleableSkillOrigin } from '../types/skill';

/**
 * The names of the two synthetic plugins the backend builds (plan 13, B-35) — fixed so this screen
 * agrees with the backend on them, the same way the panel's own menu does (plan 08,
 * `command-menu.ts`). An engine-specific detail, which this folder — `engines/claude/` — is exactly
 * where ADR-025 lets one live.
 */
export const USER_SKILLS_PLUGIN = 'remote-claude-user';
export const SYSTEM_SKILLS_PLUGIN = 'remote-claude-system';

/** The name `Options.skills` would recognise: bare for the project's own, `<plugin>:<name>` otherwise. */
export function qualifiedSkillNameOf(skill: Pick<SkillView, 'origin' | 'name'>): string {
  if (skill.origin === 'user') return `${USER_SKILLS_PLUGIN}:${skill.name}`;
  if (skill.origin === 'system') return `${SYSTEM_SKILLS_PLUGIN}:${skill.name}`;
  return skill.name;
}

/** A row key that never collides, even between a project skill and a same-named user one (S-157). */
export function skillRowKeyOf(skill: Pick<SkillView, 'origin' | 'name'>): string {
  return `${skill.origin}:${skill.name}`;
}

/** `user`/`system` origins are the only ones a whole switch turns on or off (D-20) — never `project`. */
export function isToggleableOrigin(origin: SkillView['origin']): origin is ToggleableSkillOrigin {
  return origin === 'user' || origin === 'system';
}

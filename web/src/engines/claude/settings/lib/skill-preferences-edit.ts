import type { SkillPreferencesValue, SkillView, ToggleableSkillOrigin } from '../types/skill';
import { qualifiedSkillNameOf } from './skill-identity';

/** Whether `origin` is on in `preferences` — off unless `sources` says so explicitly (D-20). */
export function isOriginEnabled(
  preferences: SkillPreferencesValue,
  origin: ToggleableSkillOrigin,
): boolean {
  return preferences.sources[origin] === true;
}

/** `preferences`, with one or many qualified names added to, or dropped from, `disabledSkills`. */
export function withSkillsToggled(
  preferences: SkillPreferencesValue,
  qualifiedNames: readonly string[],
  enabled: boolean,
): SkillPreferencesValue {
  const names = new Set(qualifiedNames);
  const kept = preferences.disabledSkills.filter((name) => !names.has(name));
  const disabledSkills = enabled ? kept : [...kept, ...qualifiedNames];
  return { sources: preferences.sources, disabledSkills };
}

/** `preferences`, with one toggleable origin switched fully on or off. */
export function withOriginToggled(
  preferences: SkillPreferencesValue,
  origin: ToggleableSkillOrigin,
  enabled: boolean,
): SkillPreferencesValue {
  return {
    sources: { ...preferences.sources, [origin]: enabled },
    disabledSkills: preferences.disabledSkills,
  };
}

/**
 * Every skill of `origin` that is about to start loading if it turns on: not already singled out on
 * its own, computed off what the screen already has on hand — no second question to the backend
 * (plan 13, B-39, S-182's own "mostra antes a lista do que vai entrar").
 */
export function skillsAboutToLoad(
  skills: readonly SkillView[],
  preferences: SkillPreferencesValue,
  origin: ToggleableSkillOrigin,
): readonly SkillView[] {
  return skills.filter(
    (skill) =>
      skill.origin === origin && !preferences.disabledSkills.includes(qualifiedSkillNameOf(skill)),
  );
}

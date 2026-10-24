import { effectiveValue, nearestOverride } from '@domain/agent-settings';
import type { DefaultsOrigin } from '@domain/agent-settings';
import type { SkillOrigin } from '../entities/skill.entity';

/** An origin whose skills can be switched fully on or off — the project's own is always on (D-20). */
export type ToggleableSkillOrigin = Extract<SkillOrigin, 'user' | 'system'>;

/**
 * What a user, or a folder, keeps of the skills a session may use (plan 13, B-34; D-20): which of
 * the two toggleable origins are on, and which skills — by the SDK-qualified name `Options.skills`
 * itself takes, bare for the project's own, `<plugin>:<name>` for the user's or the system's — are
 * off one by one. The shape of `claude_skill_preferences`' two columns, kept without translation.
 */
export interface SkillPreferences {
  /** Absent or `false` is off — the safety default of D-20: nobody's skills load until asked for. */
  readonly sources: Readonly<Partial<Record<ToggleableSkillOrigin, boolean>>>;
  readonly disabledSkills: readonly string[];
}

/** Nothing asked for yet: both toggleable origins off, no skill singled out (D-20's safety default). */
export const DEFAULT_SKILL_PREFERENCES: SkillPreferences = { sources: {}, disabledSkills: [] };

/** One folder's own preferences — it applies to the folder and to everything under it. */
export interface FolderSkillPreferences {
  readonly folder: string;
  readonly value: SkillPreferences;
}

/** What a repository read of `claude_skill_preferences` gives back, whole (plan 13, D-04). */
export interface SkillPreferencesDefaults {
  readonly user: SkillPreferences | null;
  readonly overrides: readonly FolderSkillPreferences[];
}

/** No row anywhere for this user — every folder opens on {@link DEFAULT_SKILL_PREFERENCES}. */
export const NO_SKILL_PREFERENCES: SkillPreferencesDefaults = { user: null, overrides: [] };

/**
 * {@link EffectiveValue}, narrowed: `value` is never `null`. Unlike every other default, skills need
 * a real value to compose `Options.skills` with — {@link effectiveSkillPreferences} fills the
 * "installation" layer with the safety default instead of leaving it for the session to decide.
 */
export interface ResolvedSkillPreferences {
  readonly value: SkillPreferences;
  readonly from: DefaultsOrigin;
  readonly folder?: string | undefined;
}

/**
 * The preferences that apply in a folder: the nearest folder's own over the user's own over the
 * safety default — the same layering every default in this product follows (D-04).
 */
export function effectiveSkillPreferences(
  stored: SkillPreferencesDefaults,
  folder: string | null,
): ResolvedSkillPreferences {
  const override = nearestOverride(stored.overrides, folder);
  const resolved = effectiveValue(override, stored.user);
  return resolved.value === null
    ? { value: DEFAULT_SKILL_PREFERENCES, from: 'installation' }
    : { value: resolved.value, from: resolved.from, folder: resolved.folder };
}

/** Whether `origin` is on in `preferences` — off unless `sources` says so explicitly (D-20). */
export function isOriginEnabled(
  preferences: SkillPreferences,
  origin: ToggleableSkillOrigin,
): boolean {
  return preferences.sources[origin] === true;
}

/**
 * Whether one skill, named the way `Options.skills` would recognise it, is enabled: the project's
 * own is never gated by an origin switch, only by its own name; a user's or the system's needs both
 * its origin on and its own name not singled out.
 */
export function isSkillEnabled(
  preferences: SkillPreferences,
  origin: SkillOrigin,
  qualifiedName: string,
): boolean {
  if (origin !== 'project' && !isOriginEnabled(preferences, origin)) {
    return false;
  }
  return !preferences.disabledSkills.includes(qualifiedName);
}

/**
 * What `Options.skills` should carry for a session that offers `offered` (plan 13, B-34): the names
 * `preferences` leaves enabled — `undefined` (the field omitted) when that is every one of them, the
 * CLI's own default and never `'all'` nor an explicit list that says the same thing twice (S-155).
 */
export function skillsOptionFor(
  preferences: SkillPreferences,
  offered: readonly { readonly name: string; readonly origin: SkillOrigin }[],
): readonly string[] | undefined {
  const included = offered
    .filter((skill) => isSkillEnabled(preferences, skill.origin, skill.name))
    .map((skill) => skill.name);

  return included.length === offered.length ? undefined : included;
}

/**
 * The one toggleable origin newly turned on between two states, or `null` — only turning an origin
 * on widens what a session can load, and only that goes to the trail (D-20's own asymmetry, the
 * same one D-10 already applies elsewhere: what narrows needs no approval, what widens does).
 */
export function widenedOrigin(
  before: SkillPreferences,
  after: SkillPreferences,
): ToggleableSkillOrigin | null {
  const origins: readonly ToggleableSkillOrigin[] = ['user', 'system'];
  return (
    origins.find((origin) => !isOriginEnabled(before, origin) && isOriginEnabled(after, origin)) ??
    null
  );
}

/** Whether two preferences say the same thing — what decides that saving changed nothing (S-163). */
export function sameSkillPreferences(left: SkillPreferences, right: SkillPreferences): boolean {
  const origins: readonly ToggleableSkillOrigin[] = ['user', 'system'];
  const sameSources = origins.every(
    (origin) => isOriginEnabled(left, origin) === isOriginEnabled(right, origin),
  );
  const sameSkills =
    left.disabledSkills.length === right.disabledSkills.length &&
    left.disabledSkills.every((skill) => right.disabledSkills.includes(skill));

  return sameSources && sameSkills;
}

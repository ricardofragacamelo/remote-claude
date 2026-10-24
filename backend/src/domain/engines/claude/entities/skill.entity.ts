import { originOf } from '@domain/session';
import type { SlashCommand } from '@domain/session';
import { CLAUDE_COMMAND_MENU } from '../services/command-menu';

/**
 * A skill of the project's `.claude/`, or loaded through the synthetic plugin of the user's or the
 * system's own (plan 13, B-34, B-35; D-20). Pure data — the adapter is the only place that reads a
 * directory or a frontmatter block.
 */

/** Where a skill comes from — the badge the Skills section shows (D-20). */
export type SkillOrigin = 'project' | 'user' | 'system';

/** Why a skill the installation would otherwise offer did not load (plan 13, B-35). */
export type SkillUnloadedReason = 'declaresHook' | 'linkEscapesHome';

/** One skill, as the Skills section lists it. */
export interface ProjectSkillView {
  /** The simple name — never the `plugin:name` qualifier a user/system skill loads under. */
  readonly name: string;
  readonly origin: SkillOrigin;
  readonly description: string;

  /** Relative to the folder — only ever set for a project skill. */
  readonly sourceFile: string | null;

  /** Whether the preferences of this user, or of this folder, keep it on. */
  readonly enabled: boolean;

  /** Why it never reached the installation at all, despite being a candidate — `null` when it did. */
  readonly unloadedReason: SkillUnloadedReason | null;
}

/**
 * Whether a skill's own frontmatter declares a hook — measured against the real SDK (docs/discovery
 * /01, #11 round, item 8): the CLI does not refuse to load one itself, so refusing it is this
 * product's own rule, not the CLI's (D-20). A skill like this is excluded from the synthetic plugin
 * entirely — its hook never has the chance to register.
 */
export function skillFrontmatterDeclaresHook(frontmatter: { readonly hooks?: unknown }): boolean {
  return frontmatter.hooks !== undefined;
}

/** A skill name's documented form: lower-case letters, digits and hyphens, up to 64 characters. */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX_LENGTH = 64;

/** Whether `name` is a skill name the CLI would accept as a directory name (S-160). */
export function isValidSkillName(name: string): boolean {
  return name.length > 0 && name.length <= SKILL_NAME_MAX_LENGTH && SKILL_NAME_PATTERN.test(name);
}

/**
 * Where a skill of `reloadSkills()` comes from — the project's own menu badge (plan 08's
 * {@link originOf}), reused rather than reimplemented: a skill arrives in the very same
 * `plugin:name`-or-bare shape a command does, qualified by the same two plugin names
 * ({@link CLAUDE_COMMAND_MENU}'s own, B-35). `reloadSkills()` never marks an entry `builtin`
 * (B-01) — the one case this falls back to `'system'` for is nothing a real answer has shown yet,
 * kept only so the mapping stays total.
 */
export function skillOriginOf(skill: SlashCommand): SkillOrigin {
  const origin = originOf(skill, CLAUDE_COMMAND_MENU);
  return origin === 'builtin' ? 'system' : origin;
}

/** The name a person reads — without the namespace of a plugin (the same rule {@link skillOriginOf} uses). */
export function skillLabelOf(name: string): string {
  return name.slice(name.lastIndexOf(':') + 1);
}

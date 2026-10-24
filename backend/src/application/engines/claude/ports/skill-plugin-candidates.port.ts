import type { UserId } from '@domain/auth';

/** What a synthetic skills plugin found, by name only — never a path, an adapter's own (plan 13, B-35). */
export interface SkillPluginCandidateSet {
  readonly included: readonly string[];

  /** Candidates whose frontmatter declares a hook — found, but never loaded (D-20, S-167). */
  readonly excludedForHook: readonly string[];
}

/**
 * What the synthetic plugins of a user's own and of the system's would include right now (plan 13,
 * B-34), read off the same builder
 * {@link import('./plugin-session-extension-paths').ClaudePluginSessionExtensionPaths} uses for the
 * directories themselves — asked before a session starts, never by opening one.
 */
export interface SkillPluginCandidates {
  user(userId: UserId): Promise<SkillPluginCandidateSet>;
  system(userId: UserId): Promise<SkillPluginCandidateSet>;
}

export const SKILL_PLUGIN_CANDIDATES = Symbol('SkillPluginCandidates');

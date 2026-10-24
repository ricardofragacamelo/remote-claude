/** One skill folder found under a source — contained within the root that found it (D-20). */
export interface SkillSourceCandidate {
  readonly name: string;
  readonly absolutePath: string;
  readonly mtimeMs: number;
}

/**
 * Where the skills of the user and of the system come from — engine-specific, since the directory
 * layout is the CLI's own, not a neutral concept (plan 13, B-35; D-20, D-22).
 *
 * Both methods are tolerant: a missing or unreadable source, or one whose layout this reader does
 * not recognise, answers `[]` — never a thrown error. A candidate whose own path would resolve
 * outside of the root it was found under (a symlink escaping the user's home, or the installation's
 * configuration directory) is left out, not refused with an error.
 */
export interface SkillSources {
  /** `<configDir>/skills/<name>` and `<configDir>/skills/synced/<bucket>/<name>`, each with a `SKILL.md`. */
  userSkills(configDir: string): Promise<readonly SkillSourceCandidate[]>;

  /** The `skills/` of every plugin this installation has actually installed (D-22). */
  systemSkills(configDir: string): Promise<readonly SkillSourceCandidate[]>;
}

export const SKILL_SOURCES = Symbol('SkillSources');

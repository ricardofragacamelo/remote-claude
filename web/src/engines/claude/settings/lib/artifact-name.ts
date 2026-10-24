/**
 * A name safe for a file (or a skill's own directory) created under `.claude/`: lower-case letters,
 * digits and hyphens, up to 64 characters — the same documented shape the CLI itself accepts for a
 * skill's directory name (plan 13, D-18, S-160), reused here for every kind this screen creates
 * (slash command, subagent, output style, skill) rather than inventing one pattern per kind.
 */
export const ARTIFACT_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const ARTIFACT_NAME_MAX_LENGTH = 64;

/** Whether `name` is safe to write a file (or a skill's directory) under, without asking the server. */
export function isValidArtifactName(name: string): boolean {
  return (
    name.length > 0 && name.length <= ARTIFACT_NAME_MAX_LENGTH && ARTIFACT_NAME_PATTERN.test(name)
  );
}

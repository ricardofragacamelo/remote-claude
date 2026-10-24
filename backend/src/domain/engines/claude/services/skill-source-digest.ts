import { createHash } from 'node:crypto';

/** One skill source site, as found on disk — a name and when it was last touched. */
export interface SkillSourceFingerprint {
  readonly name: string;
  readonly mtimeMs: number;
}

/**
 * The digest the synthetic skills plugin is cached on (plan 13, B-35, S-170): sorted by name, so the
 * same sources found in a different `readdir` order digest the same, and keyed on `mtimeMs`, so
 * editing a skill's `SKILL.md` in place — without adding or removing one — also invalidates the
 * cache. The same reasoning {@link import('./plugin-manifest-digest').digestOfPluginManifest}
 * documents for a plugin's own manifest, applied to a plain list of sources instead.
 */
export function digestOfSkillSources(sources: readonly SkillSourceFingerprint[]): string {
  const canonical = [...sources]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((source) => `${source.name}:${String(source.mtimeMs)}`);

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

import type { SkillSourceCandidate, SkillSources } from '@application/engines/claude';
import { isPlainObject } from '@shared/utils/plain-object';
import { isWithinRoot } from './within-root';

const SKILL_MANIFEST = 'SKILL.md';
const SYNCED_DIR = 'synced';
const INSTALLED_PLUGINS_FILE = ['plugins', 'installed_plugins.json'];
const MAX_INSTALLED_PLUGINS_BYTES = 262_144;

function isHidden(name: string): boolean {
  return name.startsWith('.');
}

/** The skill at `dir` (its name is `dir`'s own basename), or `null` if it is not one, or escapes `root`. */
async function skillCandidateAt(dir: string, root: string): Promise<SkillSourceCandidate | null> {
  const manifestPath = path.join(dir, SKILL_MANIFEST);
  const manifestStat = await fs.stat(manifestPath).catch(() => null);
  if (manifestStat === null || !manifestStat.isFile()) {
    return null;
  }

  const real = await fs.realpath(dir).catch(() => null);
  if (real === null || !isWithinRoot(real, root)) {
    return null;
  }

  return { name: path.basename(dir), absolutePath: real, mtimeMs: manifestStat.mtimeMs };
}

/** The directories directly inside `dir`, skipping hidden ones — `[]` if `dir` cannot be read. */
async function subdirectoriesOf(dir: string): Promise<readonly string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && !isHidden(entry.name))
    .map((entry) => path.join(dir, entry.name));
}

/** Every skill directly inside `dir` (not `synced/`), each checked against `root`. */
async function skillsDirectlyIn(
  dir: string,
  root: string,
): Promise<readonly SkillSourceCandidate[]> {
  const found = await Promise.all(
    (await subdirectoriesOf(dir)).map((candidate) => skillCandidateAt(candidate, root)),
  );
  return found.filter((candidate): candidate is SkillSourceCandidate => candidate !== null);
}

/**
 * The skills synced from claude.ai, nested two levels under `skills/synced/` (plan 13, B-35): a
 * bucket directory of opaque name, then the skill directories themselves — measured on a real
 * installation, not assumed from documentation (none describes this layout).
 */
async function syncedSkillsIn(
  skillsDir: string,
  root: string,
): Promise<readonly SkillSourceCandidate[]> {
  const buckets = await subdirectoriesOf(path.join(skillsDir, SYNCED_DIR));
  const perBucket = await Promise.all(buckets.map((bucket) => skillsDirectlyIn(bucket, root)));
  return perBucket.flat();
}

/** One entry of `installed_plugins.json`'s `plugins` map — tolerant of an unexpected shape. */
function installPathsOf(parsed: unknown): readonly string[] {
  if (!isPlainObject(parsed)) {
    return [];
  }
  const plugins = parsed['plugins'];
  if (!isPlainObject(plugins)) {
    return [];
  }

  const paths: string[] = [];
  for (const installs of Object.values(plugins)) {
    if (!Array.isArray(installs)) {
      continue;
    }
    for (const install of installs) {
      const installPath = isPlainObject(install) ? install['installPath'] : undefined;
      if (typeof installPath === 'string' && installPath.trim() !== '') {
        paths.push(installPath);
      }
    }
  }
  return paths;
}

/**
 * The skills of the user's own `~/.claude/skills` and of the system — plugins this installation has
 * actually installed, never the whole of a marketplace's catalogue (plan 13, B-35; D-20, D-22).
 *
 * Tolerant throughout: a missing directory, an unreadable `installed_plugins.json`, or a layout this
 * reader does not recognise all answer an empty list, never a thrown error (D-22's own rule) — the
 * synthetic plugin this feeds is still built, just with that one origin empty.
 */
@Injectable()
export class ClaudeSkillSourcesReader implements SkillSources {
  async userSkills(configDir: string): Promise<readonly SkillSourceCandidate[]> {
    const skillsDir = path.join(configDir, 'skills');
    const [direct, synced] = await Promise.all([
      skillsDirectlyIn(skillsDir, configDir),
      syncedSkillsIn(skillsDir, configDir),
    ]);

    // A name both scopes happen to share: the directly-listed one (ordinary, not synced) wins —
    // simplicity over a second tier of qualification nothing here needs yet.
    const byName = new Map(synced.map((candidate) => [candidate.name, candidate]));
    for (const candidate of direct) {
      byName.set(candidate.name, candidate);
    }
    return [...byName.values()];
  }

  async systemSkills(configDir: string): Promise<readonly SkillSourceCandidate[]> {
    const installedPluginsPath = path.join(configDir, ...INSTALLED_PLUGINS_FILE);
    const stat = await fs.stat(installedPluginsPath).catch(() => null);
    if (stat === null || stat.size > MAX_INSTALLED_PLUGINS_BYTES) {
      return [];
    }

    let installPaths: readonly string[];
    try {
      const raw = await fs.readFile(installedPluginsPath, 'utf8');
      installPaths = installPathsOf(JSON.parse(raw));
    } catch {
      return [];
    }

    const byName = new Map<string, SkillSourceCandidate>();
    for (const installPath of installPaths) {
      const skills = await skillsDirectlyIn(path.join(installPath, 'skills'), configDir);
      for (const candidate of skills) {
        // The first plugin installed to declare a name wins — a collision between two installed
        // plugins' skills is not a scenario any cenário asks this reader to resolve further.
        if (!byName.has(candidate.name)) {
          byName.set(candidate.name, candidate);
        }
      }
    }
    return [...byName.values()];
  }
}

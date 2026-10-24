import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

import { userPathSegment } from '@application/engines/claude';
import type { SkillSourceCandidate, SkillSources } from '@application/engines/claude';
import { SingleFlight } from '@application/shared';
import type { UserId } from '@domain/auth';
import {
  digestOfSkillSources,
  skillFrontmatterDeclaresHook,
  SYSTEM_SKILLS_PLUGIN,
  USER_SKILLS_PLUGIN,
} from '@domain/engines/claude';
import type { SkillOrigin } from '@domain/engines/claude';
import { parseFrontmatter } from './markdown-frontmatter';

const SKILL_MANIFEST = 'SKILL.md';
const PLUGIN_MANIFEST = ['.claude-plugin', 'plugin.json'];
const SKILLS_SUBDIR = 'skills';

/** What building one of the two synthetic plugins (user's, system's) found and did (plan 13, B-35). */
export interface SyntheticSkillsPluginResult {
  /** `null` when there is nothing to expose at all — no plugin is built, and none loads. */
  readonly pluginPath: string | null;
  readonly included: readonly SkillSourceCandidate[];

  /** Candidates whose frontmatter declared a hook — excluded, never loaded (D-20, S-167). */
  readonly excludedForHook: readonly SkillSourceCandidate[];
}

interface CachedBuild {
  readonly digest: string;
  readonly result: SyntheticSkillsPluginResult;
}

function fingerprintsOf(candidates: readonly SkillSourceCandidate[]) {
  return candidates.map((candidate) => ({ name: candidate.name, mtimeMs: candidate.mtimeMs }));
}

/** One temporary directory name, unique enough that two builds racing never collide. */
function temporaryNameFor(pluginName: string): string {
  return `${pluginName}.tmp-${String(process.pid)}-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Builds, per user, the two local plugins that bring the user's and the system's own skills into a
 * session without widening `settingSources` (plan 13, B-35; D-20, D-22; ADR-011's emendation).
 *
 * Each plugin exposes only `skills/` — a manifest naming it, and one symlink per included skill,
 * built in a temporary directory and `rename`d into place atomically (S-171): a session reading the
 * final directory mid-build either sees the previous complete build or the new one, never a
 * directory half-written. Cached per user by {@link digestOfSkillSources} of the sources found —
 * rebuilt only when a skill is added, removed, or edited since the last build — and serialized by
 * {@link SingleFlight} so two sessions starting for the same user at once build the plugin once.
 *
 * A skill whose frontmatter declares a hook is found, but never symlinked in — its hook never has
 * the chance to register (S-167). A skill whose own path would escape the config directory is
 * already excluded by {@link SkillSources} itself, before it ever reaches here.
 */
@Injectable()
export class SyntheticSkillsPluginBuilder {
  private readonly cache = new Map<string, CachedBuild>();
  private readonly building = new SingleFlight<SyntheticSkillsPluginResult>();

  constructor(
    private readonly sources: SkillSources,
    private readonly pluginsBaseDir: string,
  ) {}

  /** The user's own `~/.claude/skills` (and `synced/`), as the plugin `remote-claude-user`. */
  userPlugin(userId: UserId, configDir: string): Promise<SyntheticSkillsPluginResult> {
    return this.pluginFor('user', USER_SKILLS_PLUGIN, userId, () =>
      this.sources.userSkills(configDir),
    );
  }

  /** The skills of plugins this installation has actually installed, as `remote-claude-system`. */
  systemPlugin(userId: UserId, configDir: string): Promise<SyntheticSkillsPluginResult> {
    return this.pluginFor('system', SYSTEM_SKILLS_PLUGIN, userId, () =>
      this.sources.systemSkills(configDir),
    );
  }

  private async pluginFor(
    origin: SkillOrigin,
    pluginName: string,
    userId: UserId,
    fetchCandidates: () => Promise<readonly SkillSourceCandidate[]>,
  ): Promise<SyntheticSkillsPluginResult> {
    const candidates = await fetchCandidates();
    const digest = digestOfSkillSources(fingerprintsOf(candidates));
    const cacheKey = `${origin}:${userId.value}`;

    const known = this.cache.get(cacheKey);
    if (known !== undefined && known.digest === digest) {
      return known.result;
    }

    // `SingleFlight` itself is what makes two sessions racing for the same key build once (S-171):
    // a second caller arriving before this one's build finishes gets this same promise back,
    // never a second invocation of the callback below.
    return this.building.run(cacheKey, async () => {
      const result = await this.buildFresh(pluginName, userId, candidates);
      this.cache.set(cacheKey, { digest, result });
      return result;
    });
  }

  private async buildFresh(
    pluginName: string,
    userId: UserId,
    candidates: readonly SkillSourceCandidate[],
  ): Promise<SyntheticSkillsPluginResult> {
    const included: SkillSourceCandidate[] = [];
    const excludedForHook: SkillSourceCandidate[] = [];

    for (const candidate of candidates) {
      const raw = await fs
        .readFile(path.join(candidate.absolutePath, SKILL_MANIFEST), 'utf8')
        .catch(() => null);
      const frontmatter = raw === null ? {} : parseFrontmatter(raw);
      (skillFrontmatterDeclaresHook(frontmatter) ? excludedForHook : included).push(candidate);
    }

    if (included.length === 0) {
      return { pluginPath: null, included, excludedForHook };
    }

    const userDir = path.join(this.pluginsBaseDir, userPathSegment(userId));
    const finalDir = path.join(userDir, pluginName);
    const temporaryDir = path.join(userDir, temporaryNameFor(pluginName));

    await fs.mkdir(path.join(temporaryDir, SKILLS_SUBDIR), { recursive: true });
    await fs.mkdir(path.join(temporaryDir, ...PLUGIN_MANIFEST.slice(0, -1)), { recursive: true });
    await fs.writeFile(
      path.join(temporaryDir, ...PLUGIN_MANIFEST),
      JSON.stringify({ name: pluginName }),
      'utf8',
    );
    for (const candidate of included) {
      await fs.symlink(
        candidate.absolutePath,
        path.join(temporaryDir, SKILLS_SUBDIR, candidate.name),
        'dir',
      );
    }

    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.rename(temporaryDir, finalDir);

    return { pluginPath: finalDir, included, excludedForHook };
  }
}

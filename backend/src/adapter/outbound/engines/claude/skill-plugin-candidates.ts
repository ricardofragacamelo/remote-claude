import { Injectable } from '@nestjs/common';

import type { SkillPluginCandidateSet, SkillPluginCandidates } from '@application/engines/claude';
import type { UserId } from '@domain/auth';
import type { SyntheticSkillsPluginResult } from './synthetic-skills-plugin.builder';
import { SyntheticSkillsPluginBuilder } from './synthetic-skills-plugin.builder';

function setOf(result: SyntheticSkillsPluginResult): SkillPluginCandidateSet {
  return {
    included: result.included.map((candidate) => candidate.name),
    excludedForHook: result.excludedForHook.map((candidate) => candidate.name),
  };
}

/**
 * The names a session's user and system synthetic plugins would include, and the ones a declared
 * hook keeps out, right now (plan 13, B-34) — read off the same builder
 * {@link import('./plugin-session-extension-paths').ClaudePluginSessionExtensionPaths} uses for the
 * directories themselves, cached the same way: asking twice in the same start costs nothing extra
 * once the first answer lands.
 */
@Injectable()
export class ClaudeSkillPluginCandidates implements SkillPluginCandidates {
  constructor(
    private readonly builder: SyntheticSkillsPluginBuilder,
    private readonly configDir: string,
  ) {}

  async user(userId: UserId): Promise<SkillPluginCandidateSet> {
    return setOf(await this.builder.userPlugin(userId, this.configDir));
  }

  async system(userId: UserId): Promise<SkillPluginCandidateSet> {
    return setOf(await this.builder.systemPlugin(userId, this.configDir));
  }
}

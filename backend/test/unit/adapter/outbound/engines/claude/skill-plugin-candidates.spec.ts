import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ClaudeSkillPluginCandidates } from '@adapter/outbound/engines/claude/skill-plugin-candidates';
import { SyntheticSkillsPluginBuilder } from '@adapter/outbound/engines/claude/synthetic-skills-plugin.builder';
import type { SkillSourceCandidate, SkillSources } from '@application/engines/claude';
import { UserId } from '@domain/auth';

const OWNER = UserId.create('auth|owner');

/** A skill folder with a real SKILL.md — plain, or declaring a hook (S-167). */
function aSkillSource(root: string, name: string, declaresHook = false): SkillSourceCandidate {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  const hooks = declaresHook ? 'hooks: {}\n' : '';
  writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n${hooks}---\n`, 'utf8');
  return { name, absolutePath: dir, mtimeMs: 1 };
}

class FakeSkillSources implements SkillSources {
  user: readonly SkillSourceCandidate[] = [];
  system: readonly SkillSourceCandidate[] = [];

  userSkills(): Promise<readonly SkillSourceCandidate[]> {
    return Promise.resolve(this.user);
  }

  systemSkills(): Promise<readonly SkillSourceCandidate[]> {
    return Promise.resolve(this.system);
  }
}

describe('ClaudeSkillPluginCandidates — plan 13, B-34', () => {
  let sourcesRoot: string;
  let pluginsBaseDir: string;
  let sources: FakeSkillSources;
  let candidates: ClaudeSkillPluginCandidates;

  beforeEach(() => {
    sourcesRoot = mkdtempSync(path.join(tmpdir(), 'rc-skill-sources-'));
    pluginsBaseDir = mkdtempSync(path.join(tmpdir(), 'rc-skills-plugins-'));
    sources = new FakeSkillSources();
    candidates = new ClaudeSkillPluginCandidates(
      new SyntheticSkillsPluginBuilder(sources, pluginsBaseDir),
      sourcesRoot,
    );
  });

  afterEach(() => {
    rmSync(sourcesRoot, { recursive: true, force: true });
    rmSync(pluginsBaseDir, { recursive: true, force: true });
  });

  it('is empty, both ways, with no source at all', async () => {
    expect(await candidates.user(OWNER)).toEqual({ included: [], excludedForHook: [] });
    expect(await candidates.system(OWNER)).toEqual({ included: [], excludedForHook: [] });
  });

  it('names what the user’s own plugin would include', async () => {
    sources.user = [aSkillSource(sourcesRoot, 'explain')];

    expect(await candidates.user(OWNER)).toEqual({ included: ['explain'], excludedForHook: [] });
  });

  it('names what the system’s own plugin would include', async () => {
    sources.system = [aSkillSource(sourcesRoot, 'deploy')];

    expect(await candidates.system(OWNER)).toEqual({ included: ['deploy'], excludedForHook: [] });
  });

  it('names a candidate a declared hook kept out, separately from what is included (S-167)', async () => {
    sources.user = [aSkillSource(sourcesRoot, 'safe'), aSkillSource(sourcesRoot, 'risky', true)];

    expect(await candidates.user(OWNER)).toEqual({
      included: ['safe'],
      excludedForHook: ['risky'],
    });
  });
});

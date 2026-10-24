import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SyntheticSkillsPluginBuilder } from '@adapter/outbound/engines/claude/synthetic-skills-plugin.builder';
import type { SkillSourceCandidate, SkillSources } from '@application/engines/claude';
import { UserId } from '@domain/auth';

const OWNER = UserId.create('auth|owner');
const OTHER = UserId.create('auth|someone-else');

/** A skill folder with a real SKILL.md, so the builder can read its frontmatter. */
function aSkillSource(root: string, name: string, frontmatterExtra = ''): SkillSourceCandidate {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n${frontmatterExtra}---\n`, 'utf8');
  return { name, absolutePath: dir, mtimeMs: 1 };
}

/** A controllable double of `SkillSources` — the test owns exactly what each origin answers. */
class FakeSkillSources implements SkillSources {
  user: readonly SkillSourceCandidate[] = [];
  system: readonly SkillSourceCandidate[] = [];
  userCalls = 0;

  userSkills(): Promise<readonly SkillSourceCandidate[]> {
    this.userCalls += 1;
    return Promise.resolve(this.user);
  }

  systemSkills(): Promise<readonly SkillSourceCandidate[]> {
    return Promise.resolve(this.system);
  }
}

describe('SyntheticSkillsPluginBuilder — plan 13, B-35', () => {
  let sourcesRoot: string;
  let pluginsBaseDir: string;
  let sources: FakeSkillSources;
  let builder: SyntheticSkillsPluginBuilder;

  beforeEach(() => {
    sourcesRoot = mkdtempSync(path.join(tmpdir(), 'rc-skill-sources-'));
    pluginsBaseDir = mkdtempSync(path.join(tmpdir(), 'rc-skills-plugins-'));
    sources = new FakeSkillSources();
    builder = new SyntheticSkillsPluginBuilder(sources, pluginsBaseDir);
  });

  afterEach(() => {
    rmSync(sourcesRoot, { recursive: true, force: true });
    rmSync(pluginsBaseDir, { recursive: true, force: true });
  });

  it('answers a null path with no skills at all — no plugin is built (S-172)', async () => {
    const result = await builder.userPlugin(OWNER, '/irrelevant');

    expect(result).toEqual({ pluginPath: null, included: [], excludedForHook: [] });
  });

  it('builds a plugin with a manifest and a symlink per skill, qualified rc-user-skills-style', async () => {
    sources.user = [aSkillSource(sourcesRoot, 'explain')];

    const result = await builder.userPlugin(OWNER, '/irrelevant');

    expect(result.pluginPath).not.toBeNull();
    expect(result.included.map((candidate) => candidate.name)).toEqual(['explain']);
    expect(result.excludedForHook).toEqual([]);

    const pluginPath = result.pluginPath!;
    expect(
      JSON.parse(readFileSync(path.join(pluginPath, '.claude-plugin', 'plugin.json'), 'utf8')),
    ).toEqual({
      name: 'remote-claude-user',
    });
    const skillLink = path.join(pluginPath, 'skills', 'explain');
    expect(existsSync(skillLink)).toBe(true);
    expect(realpathSync(skillLink)).toBe(realpathSync(path.join(sourcesRoot, 'explain')));
  });

  it('builds the system plugin under its own fixed name', async () => {
    sources.system = [aSkillSource(sourcesRoot, 'reviewer')];

    const result = await builder.systemPlugin(OWNER, '/irrelevant');

    const manifest = JSON.parse(
      readFileSync(path.join(result.pluginPath!, '.claude-plugin', 'plugin.json'), 'utf8'),
    ) as { name: string };
    expect(manifest.name).toBe('remote-claude-system');
  });

  it('never symlinks a skill whose frontmatter declares a hook — it is excluded instead (S-167)', async () => {
    sources.user = [
      aSkillSource(sourcesRoot, 'plain'),
      aSkillSource(sourcesRoot, 'risky', 'hooks:\n  - PreToolUse\n'),
    ];

    const result = await builder.userPlugin(OWNER, '/irrelevant');

    expect(result.included.map((c) => c.name)).toEqual(['plain']);
    expect(result.excludedForHook.map((c) => c.name)).toEqual(['risky']);
    expect(existsSync(path.join(result.pluginPath!, 'skills', 'risky'))).toBe(false);
  });

  it('answers a null path when every candidate is excluded for declaring a hook', async () => {
    sources.user = [aSkillSource(sourcesRoot, 'risky', 'hooks:\n  - PreToolUse\n')];

    const result = await builder.userPlugin(OWNER, '/irrelevant');

    expect(result).toEqual({
      pluginPath: null,
      included: [],
      excludedForHook: [expect.objectContaining({ name: 'risky' }) as SkillSourceCandidate],
    });
  });

  it('reuses the build when the sources have not changed (S-170)', async () => {
    sources.user = [aSkillSource(sourcesRoot, 'explain')];

    const first = await builder.userPlugin(OWNER, '/irrelevant');
    const second = await builder.userPlugin(OWNER, '/irrelevant');

    expect(second.pluginPath).toBe(first.pluginPath);
    expect(sources.userCalls).toBe(2); // asked again each time — only the *build* is skipped
  });

  it('rebuilds when a skill is added, and the new one appears', async () => {
    sources.user = [aSkillSource(sourcesRoot, 'first')];
    const first = await builder.userPlugin(OWNER, '/irrelevant');

    sources.user = [...sources.user, aSkillSource(sourcesRoot, 'second')];
    const second = await builder.userPlugin(OWNER, '/irrelevant');

    expect(second.included.map((c) => c.name).sort()).toEqual(['first', 'second']);
    expect(existsSync(path.join(first.pluginPath!, 'skills', 'second'))).toBe(true);
  });

  it('two builds for the same user at once build the plugin only once (S-171)', async () => {
    sources.user = [aSkillSource(sourcesRoot, 'explain')];

    const [first, second] = await Promise.all([
      builder.userPlugin(OWNER, '/irrelevant'),
      builder.userPlugin(OWNER, '/irrelevant'),
    ]);

    expect(first.pluginPath).toBe(second.pluginPath);
    expect(existsSync(first.pluginPath!)).toBe(true);
  });

  it('never puts one user’s plugin under another user’s directory (S-173)', async () => {
    sources.user = [aSkillSource(sourcesRoot, 'explain')];

    const owner = await builder.userPlugin(OWNER, '/irrelevant');
    const other = await builder.userPlugin(OTHER, '/irrelevant');

    expect(owner.pluginPath).not.toBe(other.pluginPath);
    // Each plugin sits under its own user segment, one level above the fixed plugin name.
    expect(path.dirname(owner.pluginPath!)).not.toBe(path.dirname(other.pluginPath!));
  });

  it('a skill unreadable at build time (its SKILL.md vanished) is treated as having no frontmatter, not excluded', async () => {
    const dir = path.join(sourcesRoot, 'ghost');
    mkdirSync(dir, { recursive: true });
    sources.user = [{ name: 'ghost', absolutePath: dir, mtimeMs: 1 }];

    const result = await builder.userPlugin(OWNER, '/irrelevant');

    expect(result.included.map((c) => c.name)).toEqual(['ghost']);
  });
});

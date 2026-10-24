import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ClaudePluginSessionExtensionPaths } from '@adapter/outbound/engines/claude/plugin-session-extension-paths';
import { SyntheticSkillsPluginBuilder } from '@adapter/outbound/engines/claude/synthetic-skills-plugin.builder';
import type { SkillSources } from '@application/engines/claude';
import { UserId } from '@domain/auth';
import {
  declaredMarketplace,
  FakeMarketplaceAllowlist,
} from '../../../../../support/fakes/fake-marketplace-allowlist';
import { InMemoryPluginRepository } from '../../../../../support/fakes/in-memory-plugin.repository';

const USER = UserId.create('auth|plugin-session');
const NOW = new Date('2026-10-20T12:00:00Z');

/** No user or system skills anywhere — the builder answers `null` for both, touching no disk. */
const NO_SKILL_SOURCES: SkillSources = {
  userSkills: () => Promise.resolve([]),
  systemSkills: () => Promise.resolve([]),
};

function noSkillsPluginBuilder(): SyntheticSkillsPluginBuilder {
  return new SyntheticSkillsPluginBuilder(NO_SKILL_SOURCES, '/unused');
}

describe('ClaudePluginSessionExtensionPaths — plan 13, B-27, S-123', () => {
  it('answers only the enabled plugins’ paths of the caller', async () => {
    const plugins = new InMemoryPluginRepository();
    await plugins.insert(
      'p1',
      {
        userId: USER,
        identity: { origin: 'local', path: '/one', marketplace: null, commit: null },
        name: 'one',
        approvedDigest: 'd1',
      },
      NOW,
    );
    const disabled = await plugins.insert(
      'p2',
      {
        userId: USER,
        identity: { origin: 'local', path: '/two', marketplace: null, commit: null },
        name: 'two',
        approvedDigest: 'd2',
      },
      NOW,
    );
    await plugins.setEnabled(disabled.id, false, NOW);

    const source = new ClaudePluginSessionExtensionPaths(
      plugins,
      new FakeMarketplaceAllowlist(),
      noSkillsPluginBuilder(),
    );
    const paths = await source.pathsFor({ userId: USER, engine: 'claude' });

    expect(paths).toEqual(['/one']);
  });

  it('answers nothing for an engine other than claude', async () => {
    const plugins = new InMemoryPluginRepository();
    await plugins.insert(
      'p1',
      {
        userId: USER,
        identity: { origin: 'local', path: '/one', marketplace: null, commit: null },
        name: 'one',
        approvedDigest: 'd1',
      },
      NOW,
    );

    const source = new ClaudePluginSessionExtensionPaths(
      plugins,
      new FakeMarketplaceAllowlist(),
      noSkillsPluginBuilder(),
    );
    expect(await source.pathsFor({ userId: USER, engine: 'codex' })).toEqual([]);
  });

  it('answers nothing when the caller has no plugins at all', async () => {
    const source = new ClaudePluginSessionExtensionPaths(
      new InMemoryPluginRepository(),
      new FakeMarketplaceAllowlist(),
      noSkillsPluginBuilder(),
    );
    expect(await source.pathsFor({ userId: USER, engine: 'claude' })).toEqual([]);
  });

  describe('marketplace plugins — plan 13, B-47, S-213', () => {
    it('includes an enabled marketplace plugin whose marketplace is still declared', async () => {
      const plugins = new InMemoryPluginRepository();
      await plugins.insert(
        'p1',
        {
          userId: USER,
          identity: { origin: 'marketplace', path: '/mp/one', marketplace: 'acme', commit: 'c1' },
          name: 'one',
          approvedDigest: 'd1',
        },
        NOW,
      );
      const marketplaces = new FakeMarketplaceAllowlist([declaredMarketplace('acme')]);

      const source = new ClaudePluginSessionExtensionPaths(
        plugins,
        marketplaces,
        noSkillsPluginBuilder(),
      );
      expect(await source.pathsFor({ userId: USER, engine: 'claude' })).toEqual(['/mp/one']);
    });

    it('leaves out an enabled marketplace plugin once its marketplace is no longer declared', async () => {
      const plugins = new InMemoryPluginRepository();
      await plugins.insert(
        'p1',
        {
          userId: USER,
          identity: { origin: 'marketplace', path: '/mp/one', marketplace: 'acme', commit: 'c1' },
          name: 'one',
          approvedDigest: 'd1',
        },
        NOW,
      );
      const marketplaces = new FakeMarketplaceAllowlist([declaredMarketplace('acme')]);
      const source = new ClaudePluginSessionExtensionPaths(
        plugins,
        marketplaces,
        noSkillsPluginBuilder(),
      );

      marketplaces.set([]); // the same effect a SIGHUP reload has on the allowlist in memory

      expect(await source.pathsFor({ userId: USER, engine: 'claude' })).toEqual([]);
    });
  });

  describe('the synthetic skills plugins — plan 13, B-35', () => {
    it('appends both synthetic plugin paths after the ordinary ones, when there is something to expose', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'rc-skills-plugin-ext-'));
      const realSources: SkillSources = {
        userSkills: () =>
          Promise.resolve([{ name: 'u', absolutePath: path.join(dir, 'u'), mtimeMs: 1 }]),
        systemSkills: () =>
          Promise.resolve([{ name: 's', absolutePath: path.join(dir, 's'), mtimeMs: 1 }]),
      };
      mkdirSync(path.join(dir, 'u'), { recursive: true });
      writeFileSync(path.join(dir, 'u', 'SKILL.md'), '---\nname: u\n---\n', 'utf8');
      mkdirSync(path.join(dir, 's'), { recursive: true });
      writeFileSync(path.join(dir, 's', 'SKILL.md'), '---\nname: s\n---\n', 'utf8');
      const pluginsBaseDir = mkdtempSync(path.join(tmpdir(), 'rc-skills-plugin-base-'));

      const source = new ClaudePluginSessionExtensionPaths(
        new InMemoryPluginRepository(),
        new FakeMarketplaceAllowlist(),
        new SyntheticSkillsPluginBuilder(realSources, pluginsBaseDir),
      );

      const paths = await source.pathsFor({ userId: USER, engine: 'claude' });

      expect(paths).toHaveLength(2);
      expect(paths.some((p) => p.endsWith('remote-claude-user'))).toBe(true);
      expect(paths.some((p) => p.endsWith('remote-claude-system'))).toBe(true);

      rmSync(dir, { recursive: true, force: true });
      rmSync(pluginsBaseDir, { recursive: true, force: true });
    });

    it('appends neither synthetic path when neither origin has a skill to expose (S-172)', async () => {
      const source = new ClaudePluginSessionExtensionPaths(
        new InMemoryPluginRepository(),
        new FakeMarketplaceAllowlist(),
        noSkillsPluginBuilder(),
      );

      expect(await source.pathsFor({ userId: USER, engine: 'claude' })).toEqual([]);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ClaudeSkillSourcesReader } from '@adapter/outbound/engines/claude/skill-sources.reader';

/** Against a real filesystem — directory discovery and symlink containment need the real thing. */
describe('ClaudeSkillSourcesReader — plan 13, B-35', () => {
  let configDir: string;
  let reader: ClaudeSkillSourcesReader;

  beforeEach(() => {
    configDir = mkdtempSync(path.join(tmpdir(), 'rc-claude-config-'));
    reader = new ClaudeSkillSourcesReader();
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  function skillDir(...segments: string[]): string {
    const full = path.join(configDir, ...segments);
    mkdirSync(full, { recursive: true });
    writeFileSync(path.join(full, 'SKILL.md'), '---\nname: x\ndescription: x\n---\n', 'utf8');
    return full;
  }

  describe('userSkills', () => {
    it('finds a skill directly under skills/', async () => {
      skillDir('skills', 'explain');

      const found = await reader.userSkills(configDir);

      expect(found).toEqual([
        {
          name: 'explain',
          absolutePath: path.join(configDir, 'skills', 'explain'),
          mtimeMs: expect.any(Number) as number,
        },
      ]);
    });

    it('ignores a hidden directory under skills/, such as .trash', async () => {
      skillDir('skills', '.trash');
      skillDir('skills', 'explain');

      const found = await reader.userSkills(configDir);

      expect(found.map((candidate) => candidate.name)).toEqual(['explain']);
    });

    it('ignores a directory under skills/ with no SKILL.md', async () => {
      mkdirSync(path.join(configDir, 'skills', 'not-a-skill'), { recursive: true });

      const found = await reader.userSkills(configDir);

      expect(found).toEqual([]);
    });

    it('ignores a directory under skills/ whose SKILL.md is itself a directory', async () => {
      mkdirSync(path.join(configDir, 'skills', 'odd', 'SKILL.md'), { recursive: true });

      const found = await reader.userSkills(configDir);

      expect(found).toEqual([]);
    });

    it('finds a skill nested two levels under skills/synced/<bucket>/<name>', async () => {
      skillDir('skills', 'synced', 'bucket-1', 'pdf');

      const found = await reader.userSkills(configDir);

      expect(found.map((candidate) => candidate.name)).toEqual(['pdf']);
    });

    it('merges skills from more than one synced bucket', async () => {
      skillDir('skills', 'synced', 'bucket-1', 'pdf');
      skillDir('skills', 'synced', 'bucket-2', 'docx');

      const found = await reader.userSkills(configDir);

      expect(found.map((candidate) => candidate.name).sort()).toEqual(['docx', 'pdf']);
    });

    it('prefers a directly-listed skill over a synced one with the same name', async () => {
      const direct = skillDir('skills', 'explain');
      skillDir('skills', 'synced', 'bucket-1', 'explain');

      const found = await reader.userSkills(configDir);

      expect(found).toEqual([
        { name: 'explain', absolutePath: direct, mtimeMs: expect.any(Number) as number },
      ]);
    });

    it('refuses a skill directory symlinked outside the config dir (D-20)', async () => {
      // `readdir`'s own dirent type never follows a symlink, so a *skill folder itself* symlinked
      // at the top level is already filtered out before the containment check ever runs — this
      // proves the deeper case: the skill folder is real, but `skills/` itself is reached through a
      // symlink whose target sits outside the config dir, so the resolved realpath escapes.
      const outside = mkdtempSync(path.join(tmpdir(), 'rc-claude-outside-'));
      mkdirSync(path.join(outside, 'skills', 'leaked'), { recursive: true });
      writeFileSync(
        path.join(outside, 'skills', 'leaked', 'SKILL.md'),
        '---\nname: x\n---\n',
        'utf8',
      );
      symlinkSync(path.join(outside, 'skills'), path.join(configDir, 'skills'));

      const found = await reader.userSkills(configDir);

      expect(found).toEqual([]);
      rmSync(outside, { recursive: true, force: true });
    });

    it('is empty with no skills directory at all', async () => {
      expect(await reader.userSkills(configDir)).toEqual([]);
    });

    it('is empty with no synced directory under skills/', async () => {
      skillDir('skills', 'explain');
      const found = await reader.userSkills(configDir);
      expect(found.map((candidate) => candidate.name)).toEqual(['explain']);
    });
  });

  describe('systemSkills', () => {
    function writeInstalledPlugins(plugins: Record<string, { installPath: string }[]>): void {
      mkdirSync(path.join(configDir, 'plugins'), { recursive: true });
      writeFileSync(
        path.join(configDir, 'plugins', 'installed_plugins.json'),
        JSON.stringify({ version: 2, plugins }),
        'utf8',
      );
    }

    it('finds a skill of an installed plugin', async () => {
      const installPath = path.join(
        configDir,
        'plugins',
        'cache',
        'official',
        'my-plugin',
        '1.0.0',
      );
      mkdirSync(path.join(installPath, 'skills', 'reviewer'), { recursive: true });
      writeFileSync(
        path.join(installPath, 'skills', 'reviewer', 'SKILL.md'),
        '---\nname: reviewer\n---\n',
        'utf8',
      );
      writeInstalledPlugins({ 'my-plugin@official': [{ installPath }] });

      const found = await reader.systemSkills(configDir);

      expect(found.map((candidate) => candidate.name)).toEqual(['reviewer']);
    });

    it('is empty with no installed_plugins.json at all', async () => {
      expect(await reader.systemSkills(configDir)).toEqual([]);
    });

    it('is empty when installed_plugins.json cannot be parsed, never throwing (D-22)', async () => {
      mkdirSync(path.join(configDir, 'plugins'), { recursive: true });
      writeFileSync(
        path.join(configDir, 'plugins', 'installed_plugins.json'),
        '{ not json',
        'utf8',
      );

      expect(await reader.systemSkills(configDir)).toEqual([]);
    });

    it('is empty when the top-level JSON is not even an object', async () => {
      mkdirSync(path.join(configDir, 'plugins'), { recursive: true });
      writeFileSync(
        path.join(configDir, 'plugins', 'installed_plugins.json'),
        JSON.stringify(['not', 'an', 'object']),
        'utf8',
      );

      expect(await reader.systemSkills(configDir)).toEqual([]);
    });

    it('is empty when installed_plugins.json has an unrecognised shape for plugins', async () => {
      mkdirSync(path.join(configDir, 'plugins'), { recursive: true });
      writeFileSync(
        path.join(configDir, 'plugins', 'installed_plugins.json'),
        JSON.stringify({ plugins: 'not-an-object' }),
        'utf8',
      );

      expect(await reader.systemSkills(configDir)).toEqual([]);
    });

    it('skips a plugin entry whose installs are not an array, never throwing', async () => {
      mkdirSync(path.join(configDir, 'plugins'), { recursive: true });
      writeFileSync(
        path.join(configDir, 'plugins', 'installed_plugins.json'),
        JSON.stringify({ plugins: { 'odd@official': 'not-an-array' } }),
        'utf8',
      );

      expect(await reader.systemSkills(configDir)).toEqual([]);
    });

    it('skips an install entry with no usable installPath, never throwing', async () => {
      writeInstalledPlugins({
        broken: [{ installPath: '' }, {} as { installPath: string }],
      });

      expect(await reader.systemSkills(configDir)).toEqual([]);
    });

    it('skips an install entry that is not even an object, never throwing', async () => {
      mkdirSync(path.join(configDir, 'plugins'), { recursive: true });
      writeFileSync(
        path.join(configDir, 'plugins', 'installed_plugins.json'),
        JSON.stringify({ plugins: { odd: ['not-an-object', null, 42] } }),
        'utf8',
      );

      expect(await reader.systemSkills(configDir)).toEqual([]);
    });

    it('is empty for an installed plugin with no skills/ directory at all', async () => {
      const installPath = path.join(
        configDir,
        'plugins',
        'cache',
        'official',
        'no-skills',
        '1.0.0',
      );
      mkdirSync(installPath, { recursive: true });
      writeInstalledPlugins({ 'no-skills@official': [{ installPath }] });

      expect(await reader.systemSkills(configDir)).toEqual([]);
    });

    it('the first plugin to declare a name wins a collision between two installed plugins', async () => {
      const first = path.join(configDir, 'plugins', 'cache', 'official', 'first', '1.0.0');
      const second = path.join(configDir, 'plugins', 'cache', 'official', 'second', '1.0.0');
      mkdirSync(path.join(first, 'skills', 'shared'), { recursive: true });
      writeFileSync(
        path.join(first, 'skills', 'shared', 'SKILL.md'),
        '---\nname: x\n---\n',
        'utf8',
      );
      mkdirSync(path.join(second, 'skills', 'shared'), { recursive: true });
      writeFileSync(
        path.join(second, 'skills', 'shared', 'SKILL.md'),
        '---\nname: x\n---\n',
        'utf8',
      );
      writeInstalledPlugins({
        'first@official': [{ installPath: first }],
        'second@official': [{ installPath: second }],
      });

      const found = await reader.systemSkills(configDir);

      expect(found).toEqual([
        {
          name: 'shared',
          absolutePath: path.join(first, 'skills', 'shared'),
          mtimeMs: expect.any(Number) as number,
        },
      ]);
    });

    it('reports an installed_plugins.json above the size cap as empty, never reading it', async () => {
      mkdirSync(path.join(configDir, 'plugins'), { recursive: true });
      writeFileSync(
        path.join(configDir, 'plugins', 'installed_plugins.json'),
        JSON.stringify({ plugins: { x: [{ installPath: 'x'.repeat(300_000) }] } }),
        'utf8',
      );

      expect(await reader.systemSkills(configDir)).toEqual([]);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ClaudeProjectSkillFilesReader } from '@adapter/outbound/engines/claude/project-skill-files';

/** Against a real filesystem — directory discovery needs the real thing (plan 13, B-34). */
describe('ClaudeProjectSkillFilesReader', () => {
  let folder: string;
  let reader: ClaudeProjectSkillFilesReader;

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'rc-project-skills-'));
    reader = new ClaudeProjectSkillFilesReader();
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  function skillDir(name: string): void {
    const dir = path.join(folder, '.claude', 'skills', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: x\ndescription: x\n---\n', 'utf8');
  }

  it('finds nothing without a `.claude/skills` directory at all', async () => {
    expect(await reader.filesIn(folder)).toEqual([]);
  });

  it('names a skill by its directory, never by the filename (always SKILL.md)', async () => {
    skillDir('explain');

    expect(await reader.filesIn(folder)).toEqual([
      { name: 'explain', relativePath: '.claude/skills/explain/SKILL.md' },
    ]);
  });

  it('skips a directory with no SKILL.md inside', async () => {
    mkdirSync(path.join(folder, '.claude', 'skills', 'empty'), { recursive: true });
    skillDir('explain');

    expect((await reader.filesIn(folder)).map((file) => file.name)).toEqual(['explain']);
  });

  it('lists every skill, sorted by name', async () => {
    skillDir('zeta');
    skillDir('alpha');

    expect((await reader.filesIn(folder)).map((file) => file.name)).toEqual(['alpha', 'zeta']);
  });

  it('ignores a file directly under skills/, not a directory', async () => {
    mkdirSync(path.join(folder, '.claude', 'skills'), { recursive: true });
    writeFileSync(path.join(folder, '.claude', 'skills', 'stray.md'), 'x', 'utf8');

    expect(await reader.filesIn(folder)).toEqual([]);
  });
});

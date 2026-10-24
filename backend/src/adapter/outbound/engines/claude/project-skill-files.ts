import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

import type { ProjectCommandFile, ProjectSkillFiles } from '@application/engines/claude';

const SKILLS_DIR = ['.claude', 'skills'];
const SKILL_MANIFEST = 'SKILL.md';

/**
 * The project's own `.claude/skills/<name>/SKILL.md` (plan 13, B-34, D-20) — the name comes from the
 * directory, never from the filename, which is always `SKILL.md`. Best-effort: a missing directory,
 * or an entry without a manifest, is simply not listed, never a thrown error.
 */
@Injectable()
export class ClaudeProjectSkillFilesReader implements ProjectSkillFiles {
  async filesIn(folderPath: string): Promise<readonly ProjectCommandFile[]> {
    const skillsRoot = path.join(folderPath, ...SKILLS_DIR);
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => []);
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));

    const found: ProjectCommandFile[] = [];
    for (const entry of directories) {
      const manifestPath = path.join(skillsRoot, entry.name, SKILL_MANIFEST);
      const stat = await fs.stat(manifestPath).catch(() => null);
      if (stat !== null && stat.isFile()) {
        found.push({
          name: entry.name,
          relativePath: [...SKILLS_DIR, entry.name, SKILL_MANIFEST].join('/'),
        });
      }
    }
    return found;
  }
}

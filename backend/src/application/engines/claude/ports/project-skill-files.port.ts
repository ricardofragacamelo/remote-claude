import type { ProjectCommandFile } from './project-config-source.port';

/**
 * The project's own `.claude/skills/<name>/SKILL.md` files, by the name their directory gives them
 * (plan 13, B-34) — reused from the project-config reader's own shape, since a skill file and a
 * command file are the same thing to list: a name and where it sits relative to the folder.
 */
export interface ProjectSkillFiles {
  filesIn(folderPath: string): Promise<readonly ProjectCommandFile[]>;
}

export const PROJECT_SKILL_FILES = Symbol('ProjectSkillFiles');

import type { EngineSessionDefaults, EngineSessionOptions } from '@application/agent-settings';
import type { UserId } from '@domain/auth';
import {
  effectiveOutputStyle,
  effectiveSkillPreferences,
  outputStyleForSession,
  skillsOptionFor,
  SYSTEM_SKILLS_PLUGIN,
  USER_SKILLS_PLUGIN,
} from '@domain/engines/claude';
import type { SkillOrigin } from '@domain/engines/claude';
import type { WorkspacePath } from '@domain/workspace';
import type { ClaudeInstallationCatalog } from './installation-catalog';
import type { OutputStyleDefaultsRepository } from './ports/output-style-defaults.repository';
import type { ProjectSkillFiles } from './ports/project-skill-files.port';
import type { SkillPluginCandidates } from './ports/skill-plugin-candidates.port';
import type { SkillPreferencesRepository } from './ports/skill-preferences.repository';

/** One name `Options.skills` could include, and the origin it came from. */
interface OfferedSkill {
  readonly name: string;
  readonly origin: SkillOrigin;
}

/**
 * The defaults Claude's extension keeps for a session beside the core's (plan 13, B-15, B-34): the
 * output style that applies in the folder — dropped when the installation is known not to have it
 * any more (S-53) — and `Options.skills`, composed from the same preferences the Skills screen reads
 * and writes.
 *
 * Nothing here spawns a session or probes one: the output style is checked against what is already
 * known, and what `Options.skills` would include is computed the same way the extension paths
 * composer already has to (project files on disk, the synthetic plugins' own candidates) — a session
 * never waits on an extra question just to open with the right skills.
 */
export class ClaudeSessionDefaults implements EngineSessionDefaults {
  constructor(
    readonly engine: string,
    private readonly styles: OutputStyleDefaultsRepository,
    private readonly skillPreferences: SkillPreferencesRepository,
    private readonly catalog: ClaudeInstallationCatalog,
    private readonly projectSkillFiles: ProjectSkillFiles,
    private readonly skillPlugins: SkillPluginCandidates,
  ) {}

  async optionsFor(userId: UserId, folder: WorkspacePath): Promise<EngineSessionOptions> {
    const effectiveStyle = effectiveOutputStyle(await this.styles.read(userId), folder.value);
    const offeredStyles = this.catalog.known(folder)?.initialization.outputStyles ?? null;
    const styleOptions = outputStyleForSession(effectiveStyle, offeredStyles);

    const preferences = effectiveSkillPreferences(
      await this.skillPreferences.read(userId),
      folder.value,
    ).value;
    const offered = await this.offeredSkills(userId, folder);

    return { ...styleOptions, skills: skillsOptionFor(preferences, offered) };
  }

  private async offeredSkills(
    userId: UserId,
    folder: WorkspacePath,
  ): Promise<readonly OfferedSkill[]> {
    const [projectFiles, user, system] = await Promise.all([
      this.projectSkillFiles.filesIn(folder.value),
      this.skillPlugins.user(userId),
      this.skillPlugins.system(userId),
    ]);

    return [
      ...projectFiles.map((file): OfferedSkill => ({ name: file.name, origin: 'project' })),
      ...user.included.map((name): OfferedSkill => ({
        name: `${USER_SKILLS_PLUGIN}:${name}`,
        origin: 'user',
      })),
      ...system.included.map((name): OfferedSkill => ({
        name: `${SYSTEM_SKILLS_PLUGIN}:${name}`,
        origin: 'system',
      })),
    ];
  }
}

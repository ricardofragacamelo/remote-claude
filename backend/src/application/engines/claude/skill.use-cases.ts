import type { FolderAccess } from '@application/agent-settings';
import type { RecordAuditEventUseCase } from '@application/audit';
import type { UserId } from '@domain/auth';
import {
  DEFAULT_SKILL_PREFERENCES,
  effectiveSkillPreferences,
  isSkillEnabled,
  isValidSkillName,
  sameSkillPreferences,
  SkillNameInvalidError,
  skillLabelOf,
  skillOriginOf,
  SYSTEM_SKILLS_PLUGIN,
  USER_SKILLS_PLUGIN,
  widenedOrigin,
} from '@domain/engines/claude';
import type { ProjectSkillView, SkillOrigin, SkillPreferences } from '@domain/engines/claude';
import type { Clock } from '@domain/shared';
import type { SlashCommand } from '@domain/session';
import type { ClaudeInstallationCatalog } from './installation-catalog';
import type { ProjectCommandFile } from './ports/project-config-source.port';
import type { ProjectSkillFiles } from './ports/project-skill-files.port';
import type { SkillPluginCandidates } from './ports/skill-plugin-candidates.port';
import type { SkillPreferencesRepository } from './ports/skill-preferences.repository';

/** What every skill use case (B-34) is built with. */
export interface SkillDependencies {
  /** The name the engine's port registers — what the trail says a toggle was of. */
  readonly engine: string;
  readonly folders: FolderAccess;
  readonly catalog: ClaudeInstallationCatalog;
  readonly projectSkillFiles: ProjectSkillFiles;
  readonly skillPlugins: SkillPluginCandidates;
  readonly preferences: SkillPreferencesRepository;
  readonly trail: RecordAuditEventUseCase;
  readonly clock: Clock;
}

/** One skill `reloadSkills()` actually loaded, crossed with its project file and its preference. */
function loadedViewOf(
  skill: SlashCommand,
  fileByName: ReadonlyMap<string, ProjectCommandFile>,
  preferences: SkillPreferences,
): ProjectSkillView {
  const origin = skillOriginOf(skill);
  const name = skillLabelOf(skill.name);

  return {
    name,
    origin,
    description: skill.description,
    sourceFile: origin === 'project' ? (fileByName.get(name)?.relativePath ?? null) : null,
    enabled: isSkillEnabled(preferences, origin, skill.name),
    unloadedReason: null,
  };
}

/** A candidate a declared hook kept out of the synthetic plugin entirely — still listed (S-167). */
function excludedForHookViewOf(
  name: string,
  origin: Extract<SkillOrigin, 'user' | 'system'>,
  qualifiedName: string,
  preferences: SkillPreferences,
): ProjectSkillView {
  return {
    name,
    origin,
    description: '',
    sourceFile: null,
    enabled: isSkillEnabled(preferences, origin, qualifiedName),
    unloadedReason: 'declaresHook',
  };
}

/**
 * `GET /engines/claude/skills?folder=` — every skill of the project, the user and the system, with
 * its origin, its state and why one a declared hook kept out still shows up (plan 13, B-34, B-35).
 *
 * `reloadSkills()` is what actually loaded (through the catalogue of B-10, asked fresh — a skill just
 * created should not wait on a staleness window meant for the account, D-101's same reasoning);
 * crossed with the project's own files for `sourceFile`, and with the synthetic plugins' own
 * `excludedForHook` for the handful that never reached the installation at all.
 */
export class ReadProjectSkillsUseCase {
  constructor(private readonly deps: SkillDependencies) {}

  /** @throws the folder's refusals — `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN`, `WORKSPACE_NOT_FOUND` */
  async execute(userId: UserId, rawFolder: string): Promise<readonly ProjectSkillView[]> {
    const located = await this.deps.folders.locate(rawFolder, userId);
    const folder = located.folder;

    const [projectFiles, initialization, userPlugin, systemPlugin, stored] = await Promise.all([
      this.deps.projectSkillFiles.filesIn(folder.value),
      this.deps.catalog.of(userId, folder, true).then((answer) => answer.initialization),
      this.deps.skillPlugins.user(userId),
      this.deps.skillPlugins.system(userId),
      this.deps.preferences.read(userId),
    ]);

    const preferences = effectiveSkillPreferences(stored, folder.value).value;
    const fileByName = new Map(projectFiles.map((file) => [file.name, file]));

    const loaded = initialization.skills.map((skill) =>
      loadedViewOf(skill, fileByName, preferences),
    );
    const excludedForHook = [
      ...userPlugin.excludedForHook.map((name) =>
        excludedForHookViewOf(name, 'user', `${USER_SKILLS_PLUGIN}:${name}`, preferences),
      ),
      ...systemPlugin.excludedForHook.map((name) =>
        excludedForHookViewOf(name, 'system', `${SYSTEM_SKILLS_PLUGIN}:${name}`, preferences),
      ),
    ];

    return [...loaded, ...excludedForHook];
  }
}

/** The event `PUT /engines/claude/skills/preferences` records when turning an origin on (S-164). */
function skillSourceToggledEvent(
  engine: string,
  userId: UserId,
  folder: string | null,
  origin: string,
  at: Date,
): Parameters<RecordAuditEventUseCase['execute']>[0] {
  return {
    userId,
    kind: 'engine.skillSourceToggled',
    subjectId: folder ?? userId.value,
    subjectLabel: folder ?? 'user',
    details: { engine, folder, origin },
    at,
  };
}

/**
 * `PUT /engines/claude/skills/preferences` — sets, whole, the preferences of the user or of a folder
 * (plan 13, B-34; D-04, D-20).
 *
 * The whole value wins, like every default this product keeps (S-162): no partial toggle of a single
 * origin or skill is accepted on its own — a caller reads first, flips what it means to, and sends
 * the complete result back. Unchanged from what already applies there, it writes nothing and records
 * no event (S-163). Turning a toggleable origin on widens what a session may load and goes to the
 * trail *before* the row changes (S-164, D-20's own asymmetry); turning one off, or a single skill
 * either way, never does — narrowing needs no approval.
 */
export class SaveSkillPreferencesUseCase {
  constructor(private readonly deps: SkillDependencies) {}

  /** @throws {SkillNameInvalidError}, the folder's refusals, and the trail's */
  async execute(
    userId: UserId,
    rawFolder: string | null,
    preferences: SkillPreferences,
  ): Promise<SkillPreferences> {
    for (const qualifiedName of preferences.disabledSkills) {
      if (!isValidSkillName(skillLabelOf(qualifiedName))) {
        throw new SkillNameInvalidError(qualifiedName);
      }
    }

    const folder =
      rawFolder === null ? null : (await this.deps.folders.resolve(rawFolder, userId)).value;

    const stored = await this.deps.preferences.read(userId);
    const before =
      folder === null
        ? (stored.user ?? DEFAULT_SKILL_PREFERENCES)
        : (stored.overrides.find((override) => override.folder === folder)?.value ??
          DEFAULT_SKILL_PREFERENCES);

    if (sameSkillPreferences(before, preferences)) {
      return before;
    }

    const at = this.deps.clock.now();
    const widened = widenedOrigin(before, preferences);

    if (widened !== null) {
      await this.deps.trail.execute(
        skillSourceToggledEvent(this.deps.engine, userId, folder, widened, at),
      );
    }

    await this.deps.preferences.save(userId, folder, preferences);
    return preferences;
  }
}

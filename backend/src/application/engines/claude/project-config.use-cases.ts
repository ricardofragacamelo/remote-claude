import type { FolderAccess } from '@application/agent-settings';
import type { UserId } from '@domain/auth';
import {
  agentRisksOf,
  memoryDiverges,
  memoryFileCandidatesOf,
  memoryLoadedByRule,
  permissionRuleViewsOf,
} from '@domain/engines/claude';
import type {
  MemoryFileView,
  ProjectAgentView,
  ProjectCommandView,
  ProjectConfigView,
  ProjectOutputStyleView,
} from '@domain/engines/claude';
import type { InstallationAgent, SlashCommand } from '@domain/session';
import type { ClaudeInstallationCatalog } from './installation-catalog';
import type { InstallationFacts } from './ports/installation.ports';
import type { LiveLoadedState } from './ports/live-loaded-state.port';
import type {
  MemoryFileStat,
  ProjectConfigFileRead,
  ProjectConfigSource,
} from './ports/project-config-source.port';

/** What `ReadProjectConfigUseCase` needs besides the request itself. */
export interface ProjectConfigDependencies {
  readonly folders: FolderAccess;
  readonly catalog: ClaudeInstallationCatalog;
  readonly source: ProjectConfigSource;
  readonly liveLoadedState: LiveLoadedState;
  readonly facts: InstallationFacts;
}

const EMPTY_STAT: MemoryFileStat = { exists: false, sizeBytes: null, modifiedAt: null };

function memoryViewOf(
  path: string,
  origin: MemoryFileView['origin'],
  stat: MemoryFileStat,
  loadedMemoryFiles: readonly string[] | null,
): MemoryFileView {
  const loadedByRule = memoryLoadedByRule(origin);
  const loadedConfirmed = loadedMemoryFiles === null ? null : loadedMemoryFiles.includes(path);

  return {
    path,
    origin,
    exists: stat.exists,
    sizeBytes: stat.sizeBytes,
    modifiedAt: stat.modifiedAt,
    loadedByRule,
    loadedConfirmed,
    diverges: memoryDiverges(loadedByRule, loadedConfirmed),
  };
}

function commandViewsOf(
  commands: ProjectConfigFileRead['commandFiles'],
  installationCommands: readonly SlashCommand[],
): readonly ProjectCommandView[] {
  const fileByName = new Map(commands.map((file) => [file.name, file.relativePath]));
  const builtinNames = new Set(
    installationCommands
      .filter((command) => command.builtin === true)
      .map((command) => command.name),
  );

  return installationCommands
    .filter((command) => command.builtin !== true)
    .map((command) => ({
      name: command.name,
      description: command.description,
      argumentHint: command.argumentHint,
      sourceFile: fileByName.get(command.name) ?? null,
      shadowed: builtinNames.has(command.name),
    }));
}

function agentViewsOf(
  files: ProjectConfigFileRead['agentFiles'],
  installationAgents: readonly InstallationAgent[],
): readonly ProjectAgentView[] {
  const fileByName = new Map(files.map((file) => [file.name, file]));

  return installationAgents.map((agent) => {
    const file = fileByName.get(agent.name);
    return {
      name: agent.name,
      description: agent.description,
      model: agent.model,
      sourceFile: file?.relativePath ?? null,
      risks:
        file === undefined
          ? []
          : agentRisksOf({
              permissionMode: file.permissionMode,
              tools: file.tools,
              mcpServers: file.mcpServers,
            }),
    };
  });
}

function outputStyleViewsOf(
  files: ProjectConfigFileRead['outputStyleFiles'],
  available: readonly string[],
  current: string,
): readonly ProjectOutputStyleView[] {
  const fileByName = new Map(files.map((file) => [file.name, file.relativePath]));
  const names = new Set([...available, ...files.map((file) => file.name)]);

  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      current: name === current,
      sourceFile: fileByName.get(name) ?? null,
    }));
}

/**
 * `GET /engines/claude/project-config` — everything the project's own `.claude/` injects into this
 * product's Claude sessions, in one read (plan 13, B-31…B-33, B-36…B-38; D-16).
 *
 * Three sources, merged with a clear precedence: the documented-format files on disk (what is
 * *declared*), the installation's resolved catalogue (what the CLI would actually *offer* a session
 * — `builtin` filtered out, per B-33), and a live session's own confirmation of what it *loaded*
 * (memory only, B-32) — never a control request without a public method (B-08's rule, S-145).
 */
export class ReadProjectConfigUseCase {
  constructor(private readonly deps: ProjectConfigDependencies) {}

  /** @throws the folder's refusals — `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN`, `WORKSPACE_NOT_FOUND` */
  async execute(userId: UserId, rawFolder: string): Promise<ProjectConfigView> {
    const located = await this.deps.folders.locate(rawFolder, userId);
    const folder = located.folder;
    const candidates = memoryFileCandidatesOf(
      folder.value,
      located.root,
      this.deps.facts.configDir.path,
    );

    const [fileRead, initialization, loadedMemoryFiles] = await Promise.all([
      this.deps.source.read({
        folderPath: folder.value,
        allowlistRoot: located.root,
        memoryFilePaths: candidates.map((candidate) => candidate.path),
        homeConfigDir: this.deps.facts.configDir.path,
      }),
      // `fresh: true` — this screen exists to show the project's *current* state: the account's
      // own 60s staleness window (meant for "I just ran /login") would otherwise hide a command,
      // agent or output style a person just added until it happened to expire (measured: it does
      // not, by default — a live session in the folder is still asked directly either way).
      this.deps.catalog.of(userId, folder, true).then((answer) => answer.initialization),
      this.deps.liveLoadedState.loadedMemoryFiles(userId, folder),
    ]);

    const memory = candidates.map((candidate) =>
      memoryViewOf(
        candidate.path,
        candidate.origin,
        fileRead.memoryFiles[candidate.path] ?? EMPTY_STAT,
        loadedMemoryFiles,
      ),
    );

    return {
      folderPath: folder.value,
      memory,
      commands: commandViewsOf(fileRead.commandFiles, initialization.commands),
      agents: agentViewsOf(fileRead.agentFiles, initialization.agents),
      outputStyles: outputStyleViewsOf(
        fileRead.outputStyleFiles,
        initialization.outputStyles,
        initialization.outputStyle,
      ),
      hooks: fileRead.hooks,
      permissions: permissionRuleViewsOf(fileRead.permissions.allow, fileRead.permissions.deny),
      plugins: fileRead.plugins,
      issues: fileRead.issues,
    };
  }
}

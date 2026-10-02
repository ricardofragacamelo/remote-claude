import type { InstallationModel, SlashCommand } from '@domain/session';
import { InstallationCache, MAX_CACHED_LISTS } from './installation-cache';
import type { LiveSession } from './session-registry';

export { MAX_CACHED_LISTS } from './installation-cache';

/**
 * The slash commands of the installation, asked once and remembered — by the version of the CLI and
 * the workspace (plan 04, D-05). Two sessions asking together make one call (S-36).
 */
export class CommandCatalog {
  private readonly cache: InstallationCache<readonly SlashCommand[]>;

  constructor(capacity: number = MAX_CACHED_LISTS) {
    this.cache = new InstallationCache(capacity);
  }

  /**
   * The whole list the installation offers this session, the hidden entries included.
   *
   * @throws whatever the session's `supportedCommands()` threw — and then nothing was cached
   */
  commandsOf(live: LiveSession): Promise<readonly SlashCommand[]> {
    return this.cache.of(live, (session) => session.handle.supportedCommands());
  }

  /** Keeps what the query of the catalogue was told (plan 08, D-13). */
  put(version: string | null, workspace: string, commands: readonly SlashCommand[]): void {
    this.cache.put(version, workspace, commands);
  }

  /** The commands remembered last for a workspace, without asking anybody — or `null`. */
  latestFor(workspace: string): readonly SlashCommand[] | null {
    return this.cache.latestFor(workspace);
  }
}

/**
 * The models of the installation, asked once and remembered the same way — never a constant of
 * ours: the list changes with the installation, its plan and its version (plan 08, B-36, S-166).
 */
export class ModelCatalog {
  private readonly cache: InstallationCache<readonly InstallationModel[]>;

  constructor(capacity: number = MAX_CACHED_LISTS) {
    this.cache = new InstallationCache(capacity);
  }

  /**
   * @throws whatever the session's `supportedModels()` threw — and then nothing was cached
   */
  modelsOf(live: LiveSession): Promise<readonly InstallationModel[]> {
    return this.cache.of(live, (session) => session.handle.supportedModels());
  }

  /** Keeps what the query of the catalogue was told (plan 08, D-13). */
  put(version: string | null, workspace: string, models: readonly InstallationModel[]): void {
    this.cache.put(version, workspace, models);
  }

  /** The models remembered last for a workspace, without asking anybody — or `null`. */
  latestFor(workspace: string): readonly InstallationModel[] | null {
    return this.cache.latestFor(workspace);
  }
}

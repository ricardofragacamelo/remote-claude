import type { UserId } from '@domain/auth';
import type { SessionInitialization } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';

/** What the installation says about itself, and the version of the CLI that said it. */
export interface InstallationAnswer {
  readonly cliVersion: string | null;
  readonly initialization: SessionInitialization;
}

/**
 * What the installation says about itself, asked of a live session of the caller in the folder —
 * no probe when one is there (plan 13, S-16).
 */
export interface LiveInstallation {
  /**
   * The initialisation of a live session of `userId` running in `folder`, with the version of the
   * CLI it spawned — or `null` when the caller has none there.
   *
   * @throws {import('@domain/session').ClaudeUnavailableError} the session failed to answer
   * @throws {import('@domain/session').ClaudeTimeoutError} the session did not answer in time
   */
  initializationOf(
    userId: UserId,
    folder: WorkspacePath,
  ): Promise<{
    readonly cliVersion: string | null;
    readonly initialization: SessionInitialization;
  } | null>;
}

export const LIVE_INSTALLATION = Symbol('LiveInstallation');

/**
 * A query that only asks — `initializationResult()`, and nothing said to the model — opened in a
 * folder, under every option a session has, and closed at once (plan 13, D-05). It takes a slot of
 * the capacity while it lives.
 */
export interface InstallationProbe {
  /**
   * @throws {import('@domain/session').SessionLimitReachedError} no slot: nothing was spawned
   * @throws {import('@domain/session').ClaudeUnavailableError} the CLI failed to answer
   * @throws {import('@domain/session').ClaudeTimeoutError} the CLI did not answer in time
   */
  probe(folder: WorkspacePath): Promise<InstallationAnswer>;
}

export const INSTALLATION_PROBE = Symbol('InstallationProbe');

/** A version, or why there is none — never a failure: the diagnostic exists for when things fail. */
export interface ReadVersion {
  readonly version: string | null;
  readonly reason: string | null;
}

/** What the installation is made of, read without spawning a session (plan 13, B-11). */
export interface InstallationFacts {
  readonly agentSdk: ReadVersion;

  /** The binary the SDK spawns, from its manifest. */
  readonly bundledCli: ReadVersion;

  /** The `claude` on `PATH`, when there is one — often another version (plan 04, D-05). */
  pathCli(): Promise<ReadVersion>;

  /** The configuration directory the CLI reads: `CLAUDE_CONFIG_DIR`, or `~/.claude` without it. */
  readonly configDir: { readonly path: string; readonly fromEnvironment: boolean };
}

export const INSTALLATION_FACTS = Symbol('InstallationFacts');

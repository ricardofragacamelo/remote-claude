import type { UserId } from '@domain/auth';
import type { PermissionMode } from '@domain/engine';
import type { InstallationModel } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';

/** The models an engine's installation offers in a folder, and the version that said so. */
export interface EngineModels {
  readonly version: string | null;
  readonly models: readonly InstallationModel[];
}

/**
 * What one engine's installation offers, asked by the core without knowing the engine (plan 28,
 * B-36): its models — never a list of ours — and the modes it runs in. Each engine's extension
 * implements it, and the composition registers it.
 */
export interface EngineModelCatalog {
  /** The engine, by the name its port registers. */
  readonly engine: string;

  /** The modes of permission the engine runs in — its capability. */
  readonly permissionModes: readonly PermissionMode[];

  /**
   * The models of the installation in [folder], asked of whatever answers cheapest — a live session
   * of the caller there, a remembered answer, a probe.
   *
   * @param fresh nothing remembered is good enough: the installation is asked again
   * @throws {import('@domain/session').SessionLimitReachedError} no slot for a probe
   * @throws {import('@domain/engine').AgentUnavailableError} the engine failed to answer
   * @throws {import('@domain/engine').AgentTimeoutError} the engine did not answer in time
   */
  modelsOf(userId: UserId, folder: WorkspacePath, fresh?: boolean): Promise<EngineModels>;

  /** The models already known for [folder], without asking anybody — or `null`. */
  knownModels(folder: WorkspacePath): readonly InstallationModel[] | null;
}

/** What an engine's extension adds to the session it opens: the style of its answers today. */
export interface EngineSessionOptions {
  readonly outputStyle: string | null;

  /** The defaults of the extension the installation no longer has — dropped, and logged. */
  readonly stale: readonly string[];

  /**
   * The named capabilities a session may use, filtered by what the owner turned off — `undefined`
   * when nothing was, the engine's own default (plan 13, B-34). A core-neutral list: naming what one
   * of them is (a skill, today) is the engine's own to know.
   */
  readonly skills?: readonly string[] | undefined;
}

/**
 * The defaults an engine's extension keeps for a session beside the core's (plan 28, B-36, D-06) —
 * asked when a session of that engine opens. An engine without one opens with none of them.
 */
export interface EngineSessionDefaults {
  readonly engine: string;

  /** What [userId]'s session in [folder] opens with — checked against what is known, never probed. */
  optionsFor(userId: UserId, folder: WorkspacePath): Promise<EngineSessionOptions>;
}

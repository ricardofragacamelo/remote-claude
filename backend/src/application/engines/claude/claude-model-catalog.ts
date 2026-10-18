import type { EngineModelCatalog, EngineModels } from '@application/agent-settings';
import type { PermissionMode } from '@domain/engine';
import type { WorkspacePath } from '@domain/workspace';
import type { InstallationModel } from '@domain/session';
import type { UserId } from '@domain/auth';
import type { ClaudeInstallationCatalog } from './installation-catalog';

/**
 * Claude's installation, as the core asks any engine's for its models (plan 28, B-36): through the
 * catalogue of the extension, which answers from a live session, a remembered answer or one probe.
 */
export class ClaudeModelCatalog implements EngineModelCatalog {
  /**
   * @param engine the name the engine's port registers
   * @param permissionModes the modes the engine runs in — its capability
   */
  constructor(
    readonly engine: string,
    private readonly installation: ClaudeInstallationCatalog,
    readonly permissionModes: readonly PermissionMode[],
  ) {}

  async modelsOf(userId: UserId, folder: WorkspacePath, fresh = false): Promise<EngineModels> {
    const answer = await this.installation.of(userId, folder, fresh);
    return { version: answer.cliVersion, models: answer.initialization.models };
  }

  knownModels(folder: WorkspacePath): readonly InstallationModel[] | null {
    return this.installation.known(folder)?.initialization.models ?? null;
  }
}

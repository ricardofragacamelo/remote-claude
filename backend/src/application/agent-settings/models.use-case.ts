import { AgentSettingsForbiddenError } from '@domain/agent-settings';
import type { UserId } from '@domain/auth';
import type { PermissionMode } from '@domain/engine';
import type { InstallationModel } from '@domain/session';
import type { EngineSettings } from './engine-settings';
import type { FolderAccess } from './ports/folder-access.port';

/** The models of an engine's installation, and the modes it runs in (plan 13, B-13). */
export interface ModelsView {
  /** The version of the engine that answered, or `null` when it could not tell. */
  readonly version: string | null;
  readonly models: readonly InstallationModel[];
  readonly permissionModes: readonly PermissionMode[];
}

/**
 * `GET /engines/:engine/models?folder=` — from the engine's installation, never a list in the code:
 * it ages with the first update of the engine. The modes are the engine's own, every one of them,
 * the screen saying which can be a default.
 */
export class ReadModelsUseCase {
  constructor(
    private readonly folders: FolderAccess,
    private readonly engines: EngineSettings,
  ) {}

  /**
   * @param rawFolder the folder, or `null` for the user's first root
   * @throws `NOT_FOUND` for an engine not enabled, the folder's refusals, `FORBIDDEN` with no root,
   *   and the catalogue's
   */
  async execute(userId: UserId, engine: string, rawFolder: string | null): Promise<ModelsView> {
    const catalog = this.engines.catalog(engine);
    const folder =
      rawFolder === null
        ? await this.folders.firstRoot(userId)
        : await this.folders.resolve(rawFolder, userId);
    if (folder === null) {
      throw new AgentSettingsForbiddenError('the models of the installation');
    }

    const { version, models } = await catalog.modelsOf(userId, folder);
    return { version, models, permissionModes: catalog.permissionModes };
  }
}

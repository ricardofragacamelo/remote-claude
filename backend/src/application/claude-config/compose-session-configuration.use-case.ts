import type { UserId } from '@domain/auth';
import { defaultsForSession, effectiveDefaults } from '@domain/claude-config';
import type { ClientChoice, SessionDefaults } from '@domain/claude-config';
import type { InstallationModel } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';
import type { ClaudeInstallationCatalog } from './installation-catalog';
import type { ClaudeDefaultsRepository } from './ports/claude-defaults.repository';

/** What a session asks before it opens. */
export interface SessionConfigurationQuery {
  readonly userId: UserId;

  /** The folder, already through the allowlist: the session resolved it before asking. */
  readonly workspace: WorkspacePath;
  readonly client: ClientChoice;

  /** The models the session already knows for the folder, or `null` — nothing is probed to open. */
  readonly models: readonly InstallationModel[] | null;
}

/** What a session opens with, from the configuration of its owner (plan 13, B-15). */
export interface SessionConfiguration {
  readonly defaults: SessionDefaults;
}

/**
 * What the session asks before it opens (`SessionConfigurationSource`, a port the session declares):
 * the defaults that apply in its folder, put together with what the client chose. Nothing here
 * spawns anything — the installation is checked against what is already known of it.
 */
export class ComposeSessionConfigurationUseCase {
  constructor(
    private readonly defaults: ClaudeDefaultsRepository,
    private readonly catalog: ClaudeInstallationCatalog,
  ) {}

  async execute(query: SessionConfigurationQuery): Promise<SessionConfiguration> {
    const stored = await this.defaults.read(query.userId);
    const effective = effectiveDefaults({
      user: stored.user,
      overrides: stored.overrides,
      folder: query.workspace.value,
    });
    const known = this.catalog.known(query.workspace)?.initialization ?? null;

    return {
      defaults: defaultsForSession(
        effective,
        {
          models: query.models ?? known?.models ?? null,
          outputStyles: known?.outputStyles ?? null,
        },
        query.client,
      ),
    };
  }
}

import { defaultsForSession, effectiveDefaults } from '@domain/agent-settings';
import type { ClientChoice, SessionDefaults } from '@domain/agent-settings';
import type { UserId } from '@domain/auth';
import type { InstallationModel } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';
import type { EngineSettings } from './engine-settings';
import type { AgentDefaultsRepository } from './ports/agent-defaults.repository';

/** What a session asks before it opens. */
export interface SessionConfigurationQuery {
  readonly userId: UserId;

  /** The engine the session opens on — the defaults are that engine's. */
  readonly engine: string;

  /** The folder, already through the allowlist: the session resolved it before asking. */
  readonly workspace: WorkspacePath;
  readonly client: ClientChoice;

  /** The models the session already knows for the folder, or `null` — nothing is probed to open. */
  readonly models: readonly InstallationModel[] | null;
}

/** What a session opens with, from the configuration of its owner (plan 13, B-15). */
export interface SessionConfiguration {
  readonly defaults: SessionDefaults;

  /** The style of the answers the engine's extension keeps — `null` without one. */
  readonly outputStyle: string | null;

  /** Every default the installation no longer has, the core's and the extension's — for the log. */
  readonly stale: readonly string[];
}

/**
 * What the session asks before it opens (`SessionConfigurationSource`, a port the session declares):
 * the defaults that apply in its folder for its engine, put together with what the client chose,
 * and what the engine's extension adds. Nothing here spawns anything — the installation is checked
 * against what is already known of it. An engine this installation keeps no settings for opens with
 * the client's choice alone.
 */
export class ComposeSessionConfigurationUseCase {
  constructor(
    private readonly defaults: AgentDefaultsRepository,
    private readonly engines: EngineSettings,
  ) {}

  async execute(query: SessionConfigurationQuery): Promise<SessionConfiguration> {
    if (!this.engines.engines.includes(query.engine)) {
      const defaults = defaultsForSession(
        effectiveDefaults({ user: null, overrides: [], folder: null }),
        null,
        query.client,
      );
      return { defaults, outputStyle: null, stale: [] };
    }

    const stored = await this.defaults.read(query.userId, query.engine);
    const effective = effectiveDefaults({
      user: stored.user,
      overrides: stored.overrides,
      folder: query.workspace.value,
    });
    const known = this.engines.catalog(query.engine).knownModels(query.workspace);
    const defaults = defaultsForSession(effective, query.models ?? known, query.client);
    const options = await this.engines.optionsFor(query.engine, query.userId, query.workspace);

    return {
      defaults,
      outputStyle: options.outputStyle,
      stale: [...defaults.stale, ...options.stale],
    };
  }
}

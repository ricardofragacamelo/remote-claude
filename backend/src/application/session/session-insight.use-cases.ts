import type { UserId } from '@domain/auth';
import { requireCapability } from '@domain/engine';
import { SessionId } from '@domain/session';
import type { ContextUse, InstallationModel, McpServer } from '@domain/session';
import type { ModelCatalog } from './command-catalog';
import { liveControl } from './session-registry';
import type { SessionRegistry } from './session-registry';

/** The models of a session's installation, and the one it runs (plan 08, B-36). */
export interface SessionModels {
  readonly current: string;
  readonly models: readonly InstallationModel[];
}

/**
 * What the panel shows **about** a live session without asking the model anything — its models, the
 * use of its context window, its MCP servers (plan 08, B-36…B-38). Each is a control request of the
 * session's own query, under a deadline, and none costs quota.
 */
export class InspectSessionUseCase {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly models: ModelCatalog,
  ) {}

  /**
   * The installation's models — from the catalogue, one call for every session of an installation
   * and workspace (S-167).
   *
   * @throws {import('@domain/engine').AgentUnavailableError} the CLI failed to answer
   * @throws {import('@domain/engine').AgentTimeoutError} the CLI did not answer in time
   */
  async modelsOf(rawSessionId: string, userId: UserId): Promise<SessionModels> {
    const live = this.registry.require(SessionId.create(rawSessionId), userId);
    return { current: live.session.model, models: await this.models.modelsOf(live) };
  }

  /** The use of the session's context window, by category (B-37). @throws as {@link modelsOf} */
  async contextOf(rawSessionId: string, userId: UserId): Promise<ContextUse> {
    const live = this.registry.require(SessionId.create(rawSessionId), userId);

    // Declared, never supposed: an engine without the capability refuses before anything is asked.
    requireCapability(live.conversation.ref.engine.value, live.handle.capabilities, 'contextUse');

    return liveControl(live, 'contextUse')();
  }

  /** The session's MCP servers, reduced — never their configuration (B-38). @throws as {@link modelsOf} */
  async mcpServersOf(rawSessionId: string, userId: UserId): Promise<readonly McpServer[]> {
    return liveControl(
      this.registry.require(SessionId.create(rawSessionId), userId),
      'mcpServers',
    )();
  }
}

import { WorkspacePath } from '@domain/workspace';
import type { UserId } from '@domain/auth';
import type { McpServerConfig } from '@domain/mcp';
import { configFromRevealed } from './config-from-revealed';
import type { McpEngineCapabilities } from './mcp-engine-capabilities';
import type {
  McpServerRepository,
  RevealedMcpServer,
  StoredMcpServer,
} from './ports/mcp-server-repository.port';

/** What a session asks to compose before it opens: whose, which engine, and where. */
export interface ComposeSessionMcpServersQuery {
  readonly userId: UserId;
  readonly engine: string;
  readonly workspace: WorkspacePath;
}

/** Whether [server] applies to a session opening in [workspace] — never a disabled one. */
function appliesTo(
  server: Pick<StoredMcpServer, 'scope' | 'folderPath'>,
  workspace: WorkspacePath,
): boolean {
  if (server.scope === 'user') {
    return true;
  }
  if (server.folderPath === null) {
    return false;
  }
  try {
    return workspace.isWithin(WorkspacePath.create(server.folderPath));
  } catch {
    // A row written before a rule existed, or by a path a future writer skipped validating — the
    // domain's own call: a folder that cannot even be read as one never contains anything.
    return false;
  }
}

/**
 * What a session composes before it opens (plan 13, B-21; D-01): every server of the user's own of
 * scope `user`, for that engine, plus every `folder`-scoped one whose folder contains the session's
 * workspace — never another user's, never a disabled one, and never for an engine without the `mcp`
 * capability. The project's own `.mcp.json` approvals join this set once B-24 exists; until then,
 * the store alone decides.
 *
 * Pure composition, no field of any engine's own library: the result crosses into the engine through
 * {@link import('@application/session').AgentEnginePort}'s `EngineControl.setMcpServers`, and only
 * the engine's own adapter translates it (D-02, D-25).
 */
export class ComposeSessionMcpServersUseCase {
  constructor(
    private readonly servers: McpServerRepository,
    private readonly capabilities: McpEngineCapabilities,
  ) {}

  async execute(query: ComposeSessionMcpServersQuery): Promise<readonly McpServerConfig[]> {
    if (!this.capabilities.supported.includes(query.engine)) {
      return [];
    }

    const stored = await this.servers.listFor(query.userId, query.engine);
    const candidates = stored.filter(
      (server) => server.enabled && appliesTo(server, query.workspace),
    );

    const revealed = await Promise.all(candidates.map((server) => this.servers.reveal(server.id)));

    return revealed
      .filter((server): server is RevealedMcpServer => server !== null)
      .map(configFromRevealed);
  }
}

import { WorkspacePath } from '@domain/workspace';
import type { UserId } from '@domain/auth';
import { digestOfProjectMcpEntry } from '@domain/mcp';
import type { McpServerConfig } from '@domain/mcp';
import { configFromRevealed } from './config-from-revealed';
import type { McpEngineCapabilities } from './mcp-engine-capabilities';
import type { McpProjectApprovalRepository } from './ports/mcp-project-approval-repository.port';
import type {
  McpServerRepository,
  RevealedMcpServer,
  StoredMcpServer,
} from './ports/mcp-server-repository.port';
import type { ProjectMcpServersSources } from './project-mcp-servers-sources';

/** What a session asks to compose before it opens: whose, which engine, and where. */
export interface ComposeSessionMcpServersQuery {
  readonly userId: UserId;
  readonly engine: string;
  readonly workspace: WorkspacePath;
}

/** Whether a folder applies to a session opening in [workspace] — the session's own, or an ancestor. */
function folderApplies(folderPath: string, workspace: WorkspacePath): boolean {
  try {
    return workspace.isWithin(WorkspacePath.create(folderPath));
  } catch {
    // A row written before a rule existed, or by a path a future writer skipped validating — the
    // domain's own call: a folder that cannot even be read as one never contains anything.
    return false;
  }
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
  return folderApplies(server.folderPath, workspace);
}

/**
 * What a session composes before it opens (plan 13, B-21, B-24; D-01, D-11): every server of the
 * user's own of scope `user`, for that engine, plus every `folder`-scoped one whose folder contains
 * the session's workspace, plus every entry of a project's own MCP file approved at its current
 * digest for a folder that contains the workspace — never another user's, never a disabled one, and
 * never for an engine without the `mcp` capability.
 *
 * A name the store already has wins over a project entry of the same name, which is shadowed and
 * left out entirely (S-87) — the store is what this person configured on purpose; the project file
 * is a repository's own, and two servers answering to the same name inside one session would be
 * ambiguous about which one actually runs. Among project entries themselves, the one in the folder
 * nearest the workspace wins a name collision, the same proximity rule a `folder`-scope store server
 * already follows.
 *
 * Composing never climbs the filesystem again: it trusts the approvals already on record (each only
 * ever written for a folder the allowlist already let B-24's screen read) and re-reads just the one
 * file each still names, to catch a change since the approval without waiting for the screen to
 * notice it first.
 *
 * Pure composition, no field of any engine's own library: the result crosses into the engine through
 * {@link import('@application/session').AgentEnginePort}'s `EngineControl.setMcpServers`, and only
 * the engine's own adapter translates it (D-02, D-25).
 */
export class ComposeSessionMcpServersUseCase {
  constructor(
    private readonly servers: McpServerRepository,
    private readonly capabilities: McpEngineCapabilities,
    private readonly projectSources: ProjectMcpServersSources,
    private readonly approvals: McpProjectApprovalRepository,
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
    const storeConfigs = revealed
      .filter((server): server is RevealedMcpServer => server !== null)
      .map(configFromRevealed);

    const storeNames = new Set(storeConfigs.map((config) => config.name));
    const projectConfigs = await this.projectConfigsFor(query, storeNames);

    return [...storeConfigs, ...projectConfigs];
  }

  private async projectConfigsFor(
    query: ComposeSessionMcpServersQuery,
    storeNames: ReadonlySet<string>,
  ): Promise<readonly McpServerConfig[]> {
    const source = this.projectSources.for(query.engine);
    if (source === null) {
      return [];
    }

    const decisions = await this.approvals.listFor(query.userId, query.engine);
    const approved = decisions
      .filter(
        (row) => row.decision === 'approved' && folderApplies(row.folderPath, query.workspace),
      )
      // Nearest folder first — the longest path is the deepest one under an absolute root.
      .sort((a, b) => b.folderPath.length - a.folderPath.length);

    const seen = new Set<string>();
    const configs: McpServerConfig[] = [];

    for (const approval of approved) {
      if (storeNames.has(approval.name) || seen.has(approval.name)) {
        continue;
      }

      const file = await source.readAt(approval.folderPath);
      const entry = file?.entries.find((candidate) => candidate.name === approval.name) ?? null;
      if (entry === null || digestOfProjectMcpEntry(entry) !== approval.digest) {
        // Gone, or changed since the approval (S-103) — not what was approved, so it does not run.
        continue;
      }

      seen.add(approval.name);
      configs.push({ scope: 'folder', folderPath: approval.folderPath, ...entry });
    }

    return configs;
  }
}

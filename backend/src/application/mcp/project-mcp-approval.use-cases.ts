import type { RecordAuditEventUseCase } from '@application/audit';
import type { FolderAccess } from '@application/agent-settings';
import {
  McpApprovalStaleError,
  describeMcpServer,
  digestOfProjectMcpEntry,
  projectMcpApprovalStateOf,
  snapshotOfProjectMcpEntry,
} from '@domain/mcp';
import type {
  ProjectMcpApprovalState,
  ProjectMcpEntry,
  ProjectMcpEntrySnapshot,
} from '@domain/mcp';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type { McpEngineCapabilities } from './mcp-engine-capabilities';
import type { McpProjectApprovalRepository } from './ports/mcp-project-approval-repository.port';
import type { ProjectMcpFileError } from './ports/project-mcp-servers.source';
import type { ProjectMcpServersSources } from './project-mcp-servers-sources';

/** What every use case of this file shares. */
export interface McpProjectApprovalDependencies {
  readonly capabilities: McpEngineCapabilities;
  readonly folders: FolderAccess;
  readonly sources: ProjectMcpServersSources;
  readonly approvals: McpProjectApprovalRepository;
  readonly trail: RecordAuditEventUseCase;
  readonly clock: Clock;
}

/** One entry of a project's MCP file, with where it stands (plan 13, B-24; D-11). */
export interface ProjectMcpServerView {
  readonly folderPath: string;
  readonly name: string;
  readonly state: ProjectMcpApprovalState;
  readonly digest: string;
  readonly transport: ProjectMcpEntry['transport'];
  readonly command: string | null;
  readonly args: readonly string[];
  readonly url: string | null;
  readonly env: ProjectMcpEntry['env'];
  readonly headers: ProjectMcpEntry['headers'];

  /**
   * What was approved, when `state` is `approved` or `changed` — `null` for `pending`/`rejected`,
   * and for an approval written before this field existed (plan 13, B-28, D-80). The screen that
   * shows a `changed` entry diffs this against the fields above, the current content.
   */
  readonly approvedSnapshot: ProjectMcpEntrySnapshot | null;
}

/** One folder's file the climb could not read — nothing of it is approvable (S-106). */
export interface ProjectMcpFileIssue {
  readonly folderPath: string;
  readonly reason: ProjectMcpFileError;
}

export interface ProjectMcpListResult {
  readonly servers: readonly ProjectMcpServerView[];
  readonly errors: readonly ProjectMcpFileIssue[];
}

// U+001F (the ASCII "unit separator"), not NUL: this value reaches `subjectId`, a Postgres `text`
// column that refuses NUL outright (`invalid byte sequence for encoding "UTF8": 0x00`) — found by
// running this against a real database, not assumed.
function key(folderPath: string, name: string): string {
  return `${folderPath}\u001f${name}`;
}

function viewOf(
  folderPath: string,
  entry: ProjectMcpEntry,
  state: ProjectMcpApprovalState,
  digest: string,
  approvedSnapshot: ProjectMcpEntrySnapshot | null = null,
): ProjectMcpServerView {
  return { folderPath, state, digest, approvedSnapshot, ...entry };
}

/** The audit record of an approval decision — the por-extenso description, as B-18 already has it. */
function approvalEvent(
  kind: 'mcp.projectServerApproved' | 'mcp.projectServerRejected',
  userId: UserId,
  engine: string,
  folderPath: string,
  entry: ProjectMcpEntry,
  at: Date,
): Parameters<RecordAuditEventUseCase['execute']>[0] {
  const description = describeMcpServer({ scope: 'folder', folderPath, ...entry });

  return {
    userId,
    kind,
    subjectId: key(folderPath, entry.name),
    subjectLabel: entry.name,
    details: { engine, folder: folderPath, ...description },
    at,
  };
}

/** The entry named [name] in [folderPath]'s file, right now — `null` when there simply is none. */
async function entryInFolder(
  deps: McpProjectApprovalDependencies,
  engine: string,
  folderPath: string,
  name: string,
): Promise<ProjectMcpEntry | null> {
  const source = deps.sources.for(engine);
  const file = source === null ? null : await source.readAt(folderPath);
  return file?.entries.find((candidate) => candidate.name === name) ?? null;
}

/** The folder an approval or a rejection names, resolved, and the entry it currently finds there. */
async function entryAt(
  deps: McpProjectApprovalDependencies,
  userId: UserId,
  engine: string,
  rawFolder: string,
  name: string,
): Promise<{ readonly folderPath: string; readonly entry: ProjectMcpEntry | null }> {
  const folderPath = (await deps.folders.resolve(rawFolder, userId)).value;
  return { folderPath, entry: await entryInFolder(deps, engine, folderPath, name) };
}

/**
 * `GET /engines/:engine/project-mcp-approvals` — every entry of a project's own MCP file the engine
 * finds climbing from `folder`, each with where it stands: pending (never decided), approved (our
 * decision matches its current digest), rejected (our decision, holding regardless of the digest),
 * or changed (approved once, at a digest the entry no longer has — S-100, S-103).
 */
export class ListProjectMcpServersUseCase {
  constructor(private readonly deps: McpProjectApprovalDependencies) {}

  /** @throws {import('@domain/mcp').McpEngineNotSupportedError} and the folder's refusals (S-110) */
  async execute(userId: UserId, engine: string, folder: string): Promise<ProjectMcpListResult> {
    this.deps.capabilities.assertSupports(engine);
    const located = await this.deps.folders.locate(folder, userId);
    const source = this.deps.sources.for(engine);

    if (source === null) {
      return { servers: [], errors: [] };
    }

    const [files, decisions] = await Promise.all([
      source.climb({ folder: located.folder.value, allowlistRoot: located.root }),
      this.deps.approvals.listFor(userId, engine),
    ]);

    const decisionByKey = new Map(decisions.map((row) => [key(row.folderPath, row.name), row]));
    const servers: ProjectMcpServerView[] = [];
    const errors: ProjectMcpFileIssue[] = [];

    for (const file of files) {
      if (file.error !== null) {
        errors.push({ folderPath: file.folderPath, reason: file.error });
        continue;
      }

      for (const entry of file.entries) {
        const digest = digestOfProjectMcpEntry(entry);
        const decision = decisionByKey.get(key(file.folderPath, entry.name)) ?? null;
        const state = projectMcpApprovalStateOf(digest, decision);
        const approvedSnapshot = decision?.decision === 'approved' ? decision.snapshot : null;
        servers.push(viewOf(file.folderPath, entry, state, digest, approvedSnapshot));
      }
    }

    return { servers, errors };
  }
}

/**
 * `PUT /engines/:engine/project-mcp-approvals` — approving one entry, at the digest the screen
 * showed (D-11). The file is read again, now: if the entry is gone or its digest no longer matches
 * what was shown, nothing is written and the caller is told to look again (`MCP_APPROVAL_STALE`,
 * S-102) — approving blind would be approving whatever is there now, not what was seen.
 */
export class ApproveProjectMcpServerUseCase {
  constructor(private readonly deps: McpProjectApprovalDependencies) {}

  /**
   * @throws {import('@domain/mcp').McpEngineNotSupportedError} and the folder's refusals (S-110)
   * @throws {import('@domain/mcp').McpApprovalStaleError} the entry is gone, or changed (S-102)
   */
  async execute(
    userId: UserId,
    engine: string,
    folder: string,
    name: string,
    digest: string,
  ): Promise<ProjectMcpServerView> {
    this.deps.capabilities.assertSupports(engine);
    const { folderPath, entry } = await entryAt(this.deps, userId, engine, folder, name);
    const currentDigest = entry === null ? null : digestOfProjectMcpEntry(entry);

    if (entry === null || currentDigest !== digest) {
      throw new McpApprovalStaleError(folderPath, name);
    }

    const existing = await this.deps.approvals.findOne(userId, engine, folderPath, name);
    if (existing?.decision === 'approved' && existing.digest === digest) {
      // S-107: the same digest approved again writes nothing a second time.
      return viewOf(folderPath, entry, 'approved', digest, existing.snapshot);
    }

    const snapshot = snapshotOfProjectMcpEntry(entry);
    const at = this.deps.clock.now();
    await this.deps.approvals.upsert(
      { userId, engine, folderPath, name, digest, decision: 'approved', snapshot },
      at,
    );
    await this.deps.trail.execute(
      approvalEvent('mcp.projectServerApproved', userId, engine, folderPath, entry, at),
    );

    return viewOf(folderPath, entry, 'approved', digest, snapshot);
  }
}

/**
 * `DELETE /engines/:engine/project-mcp-approvals?folder=&name=` — rejecting one entry (D-11).
 *
 * Narrowing, so no digest is asked and nothing can be stale: saying no to whatever is named there
 * never authorises a program nobody evaluated, whatever it turns out to be. Holds even if the entry
 * is gone from the file already, or never existed — a pre-emptive "no" is still a decision.
 */
export class RejectProjectMcpServerUseCase {
  constructor(private readonly deps: McpProjectApprovalDependencies) {}

  /** @throws {import('@domain/mcp').McpEngineNotSupportedError} and the folder's refusals (S-110) */
  async execute(userId: UserId, engine: string, folder: string, name: string): Promise<void> {
    this.deps.capabilities.assertSupports(engine);
    const folderPath = (await this.deps.folders.resolve(folder, userId)).value;

    const existing = await this.deps.approvals.findOne(userId, engine, folderPath, name);
    if (existing?.decision === 'rejected') {
      // S-107's idempotency, the same shape for a rejection.
      return;
    }

    const entry = await entryInFolder(this.deps, engine, folderPath, name);
    const digest = entry === null ? '' : digestOfProjectMcpEntry(entry);
    const at = this.deps.clock.now();

    await this.deps.approvals.upsert(
      { userId, engine, folderPath, name, digest, decision: 'rejected', snapshot: null },
      at,
    );

    if (entry !== null) {
      await this.deps.trail.execute(
        approvalEvent('mcp.projectServerRejected', userId, engine, folderPath, entry, at),
      );
      return;
    }

    // Nothing to describe por extenso when the entry is not there — the subject still names what
    // was rejected, just without the sentence a vanished entry cannot produce truthfully.
    await this.deps.trail.execute({
      userId,
      kind: 'mcp.projectServerRejected',
      subjectId: key(folderPath, name),
      subjectLabel: name,
      details: { engine, folder: folderPath },
      at,
    });
  }
}

import type { UserId } from '@domain/auth';

/** What a decision writes. */
export interface McpProjectApprovalWrite {
  readonly userId: UserId;
  readonly engine: string;
  readonly folderPath: string;
  readonly name: string;
  readonly digest: string;
  readonly decision: 'approved' | 'rejected';
}

/** One decision we recorded on one entry of one folder's project MCP file (plan 13, B-24; D-11). */
export interface StoredMcpProjectApproval extends McpProjectApprovalWrite {
  readonly decidedAt: Date;
}

/**
 * Our approval of entries of a project's MCP file, by (user, engine, folder, name) — never by the
 * entry's content alone, so the same name in two different folders is two different decisions
 * (plan 13, B-24; D-11).
 */
export interface McpProjectApprovalRepository {
  /** Every decision of this user, in this engine, across every folder — for composing a session. */
  listFor(userId: UserId, engine: string): Promise<readonly StoredMcpProjectApproval[]>;

  findOne(
    userId: UserId,
    engine: string,
    folderPath: string,
    name: string,
  ): Promise<StoredMcpProjectApproval | null>;

  /** Replaces whatever decision stood for (user, engine, folder, name), if any. */
  upsert(write: McpProjectApprovalWrite, now: Date): Promise<StoredMcpProjectApproval>;
}

export const MCP_PROJECT_APPROVAL_REPOSITORY = Symbol('McpProjectApprovalRepository');

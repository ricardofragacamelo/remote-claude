import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { UserId } from '@domain/auth';
import type { ProjectMcpEntrySnapshot } from '@domain/mcp';
import type {
  McpProjectApprovalRepository,
  McpProjectApprovalWrite,
  StoredMcpProjectApproval,
} from '@application/mcp';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { mcpProjectApprovals } from '@infra/database/schema';
import { runLogged } from '../query-logging';

type Row = typeof mcpProjectApprovals.$inferSelect;

/** The column is untyped `jsonb` (schema files never import `@domain`) — narrowed only here. */
function snapshotOf(value: unknown): ProjectMcpEntrySnapshot | null {
  return (value as ProjectMcpEntrySnapshot | null) ?? null;
}

function storedOf(row: Row): StoredMcpProjectApproval {
  return {
    userId: UserId.create(row.userId),
    engine: row.engine,
    folderPath: row.folderPath,
    name: row.name,
    digest: row.digest,
    decision: row.decision as StoredMcpProjectApproval['decision'],
    decidedAt: row.decidedAt,
    snapshot: snapshotOf(row.snapshot),
  };
}

/** The predicate of a user's own rows, in one engine — every read starts here. */
function ownRows(userId: UserId, engine: string) {
  return and(eq(mcpProjectApprovals.userId, userId.value), eq(mcpProjectApprovals.engine, engine));
}

/**
 * `mcp_project_approvals`, in PostgreSQL (plan 13, B-24; D-11): our decision on one entry of one
 * folder's project MCP file, by (user, engine, folder, name). A decision writes the **whole** row,
 * `INSERT … ON CONFLICT DO UPDATE` on the primary key — approving twice, or approving after a
 * rejection, always leaves one coherent row, never a mix.
 */
@Injectable()
export class DrizzleMcpProjectApprovalRepository implements McpProjectApprovalRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async listFor(userId: UserId, engine: string): Promise<readonly StoredMcpProjectApproval[]> {
    const rows = await runLogged(
      this.context.logger,
      'mcpProjectApprovals.listFor',
      this.context.db.select().from(mcpProjectApprovals).where(ownRows(userId, engine)),
    );

    return rows.map(storedOf);
  }

  async findOne(
    userId: UserId,
    engine: string,
    folderPath: string,
    name: string,
  ): Promise<StoredMcpProjectApproval | null> {
    const rows = await runLogged(
      this.context.logger,
      'mcpProjectApprovals.findOne',
      this.context.db
        .select()
        .from(mcpProjectApprovals)
        .where(
          and(
            ownRows(userId, engine),
            eq(mcpProjectApprovals.folderPath, folderPath),
            eq(mcpProjectApprovals.name, name),
          ),
        ),
    );

    return rows[0] === undefined ? null : storedOf(rows[0]);
  }

  async upsert(write: McpProjectApprovalWrite, now: Date): Promise<StoredMcpProjectApproval> {
    const row = {
      userId: write.userId.value,
      engine: write.engine,
      folderPath: write.folderPath,
      name: write.name,
      digest: write.digest,
      decision: write.decision,
      decidedAt: now,
      snapshot: write.snapshot,
    };

    const [stored] = await runLogged(
      this.context.logger,
      'mcpProjectApprovals.upsert',
      this.context.db
        .insert(mcpProjectApprovals)
        .values(row)
        .onConflictDoUpdate({
          target: [
            mcpProjectApprovals.userId,
            mcpProjectApprovals.engine,
            mcpProjectApprovals.folderPath,
            mcpProjectApprovals.name,
          ],
          set: {
            digest: row.digest,
            decision: row.decision,
            decidedAt: row.decidedAt,
            snapshot: row.snapshot,
          },
        })
        .returning(),
    );

    // The row just written, by its own values — `RETURNING` on an upsert always answers with it.
    return storedOf(stored as Row);
  }
}

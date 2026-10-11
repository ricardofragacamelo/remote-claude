import { Inject, Injectable } from '@nestjs/common';
import { and, asc, gt, inArray, isNull } from 'drizzle-orm';

import type {
  InvocationKind,
  InvocationTable,
  ToolKindBackfillStore,
  UntaggedInvocation,
} from '@application/permission';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { auditEntries, permissionRequests } from '@infra/database/schema';
import { runLogged } from '../query-logging';

/** The table of each record of a call. */
const TABLES = { auditEntries, permissionRequests } as const;

/**
 * `audit_entries` and `permission_requests`, as the data step of plan 28 · B-33 gives the rows
 * written before `0023` their kind.
 *
 * Every write is guarded by `tool_kind IS NULL`, so a kind is written once and never changed — the
 * one change the trail's trigger lets through, and only that one (`0023_canonical_rules.sql`).
 */
@Injectable()
export class DrizzleToolKindBackfillStore implements ToolKindBackfillStore {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async untagged(
    table: InvocationTable,
    afterId: string | null,
    limit: number,
  ): Promise<UntaggedInvocation[]> {
    const target = TABLES[table];
    const rows = await runLogged(
      this.context.logger,
      `${table}.untagged`,
      this.context.db
        .select({ id: target.id, toolName: target.toolName, input: target.input })
        .from(target)
        .where(and(isNull(target.toolKind), afterId === null ? undefined : gt(target.id, afterId)))
        .orderBy(asc(target.id))
        .limit(limit),
    );

    return rows.map((row) => ({
      id: row.id,
      toolName: row.toolName,
      input: inputOf(row.input),
    }));
  }

  async tag(table: InvocationTable, kinds: readonly InvocationKind[]): Promise<number> {
    const target = TABLES[table];
    const byKind = new Map<string, string[]>();

    for (const { id, kind } of kinds) {
      byKind.set(kind, [...(byKind.get(kind) ?? []), id]);
    }

    let written = 0;

    for (const [kind, ids] of byKind) {
      const rows = await runLogged(
        this.context.logger,
        `${table}.tag`,
        this.context.db
          .update(target)
          .set({ toolKind: kind })
          .where(and(inArray(target.id, ids), isNull(target.toolKind)))
          .returning({ id: target.id }),
      );
      written += rows.length;
    }

    return written;
  }
}

/** The stored input as a record — what the classifier reads; anything else is an empty one. */
function inputOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

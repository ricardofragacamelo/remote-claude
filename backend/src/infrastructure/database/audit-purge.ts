import type pg from 'pg';

import { PurgeAuditTrailUseCase } from '@application/audit';
import type { AuditPurgeReport } from '@application/audit';
import type { AuditTrail } from '@domain/audit';
import type { Clock, IdGenerator } from '@domain/shared';
import { DrizzleAuditRetentionStore } from '@adapter/outbound/persistence/audit/drizzle-audit-retention.store';
import type { Logger } from '@shared/logging/logger';

/** What the purge is built from. */
export interface AuditPurgeDependencies {
  readonly pool: pg.Pool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly retentionDays: number;
}

/**
 * The purge, assembled.
 *
 * One function for the job's module and for `pnpm db purge`, so the two do not merely call the same
 * use case but are built the same way: a second assembly is where the command would start using a
 * different store, or forget the lock, without anybody deciding it should
 * ([D-07](../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export function createAuditPurge(dependencies: AuditPurgeDependencies): PurgeAuditTrailUseCase {
  return new PurgeAuditTrailUseCase(
    new DrizzleAuditRetentionStore(dependencies.pool, dependencies.logger),
    dependencies.clock,
    dependencies.ids,
    { retentionDays: dependencies.retentionDays },
  );
}

/** How one trail fared, in words a person and a script can both read. */
export interface PurgedTrailSummary {
  readonly trail: AuditTrail;
  readonly deleted: number;
  /** What the database said, when it refused; `null` when the trail was purged to the window. */
  readonly error: string | null;
}

/** A report, as the command prints it and the job logs it. */
export interface AuditPurgeSummary {
  readonly status: AuditPurgeReport['status'];
  readonly triggeredBy: AuditPurgeReport['triggeredBy'];
  readonly retentionDays: number;
  readonly cutoff: string;
  readonly purgeId: string | null;
  readonly reason: string | null;
  readonly trails: readonly PurgedTrailSummary[];
}

/**
 * The report without its error objects, and with dates as ISO strings.
 *
 * The message is the driver's, not Drizzle's: Drizzle wraps a failed query in an error whose own
 * message is only "Failed query: …", and the reason — the trigger refusing, the connection gone —
 * is on its `cause`.
 */
export function summarisePurge(report: AuditPurgeReport): AuditPurgeSummary {
  const common = {
    status: report.status,
    triggeredBy: report.triggeredBy,
    retentionDays: report.retentionDays,
    cutoff: report.cutoff.toISOString(),
  };

  if (report.status === 'skipped') {
    return { ...common, purgeId: null, reason: report.reason, trails: [] };
  }

  return {
    ...common,
    purgeId: report.purgeId,
    reason: null,
    trails: report.trails.map((trail) => ({
      trail: trail.trail,
      deleted: trail.deleted,
      error: trail.failure === null ? null : failureMessage(trail.failure.error),
    })),
  };
}

/** The most specific message an error carries. */
export function failureMessage(error: unknown): string {
  const cause = (error as { cause?: unknown } | null)?.cause;

  if (cause instanceof Error) {
    return cause.message;
  }

  return error instanceof Error ? error.message : String(error);
}

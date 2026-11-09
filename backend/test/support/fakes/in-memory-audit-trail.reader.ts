import type {
  AuditTrailPage,
  AuditTrailPageRequest,
  AuditTrailReader,
  DecidedInvocation,
  RuleUsage,
  SessionTrailOwnership,
} from '@application/audit';
import type { AuditEntry } from '@domain/audit';
import type { UserId } from '@domain/auth';

/** One row the fake holds — the entry, the owner, and the `seq` that orders it. */
export interface StoredAuditEntry {
  readonly seq: number;
  readonly userId: UserId;
  readonly entry: AuditEntry;
  readonly ruleId: string | null;
  /** The folder its session ran in, as `session_origins` would say — `null` by default. */
  readonly folder?: string | null;
}

/** `audit_entries`, in a list — enough of its filters and `usageOf` to test a reader of it. */
export class InMemoryAuditTrailReader implements AuditTrailReader {
  readonly rows: StoredAuditEntry[] = [];

  page(request: AuditTrailPageRequest): Promise<AuditTrailPage> {
    const matching = this.rows
      .filter(
        (row) =>
          row.userId.equals(request.userId) &&
          (request.ruleId === undefined ||
            request.ruleId === null ||
            row.ruleId === request.ruleId) &&
          (request.before === null || row.seq < request.before),
      )
      .sort((a, b) => b.seq - a.seq);

    const kept = matching.slice(0, request.limit);
    const hasMore = matching.length > request.limit;

    return Promise.resolve({
      records: kept.map((row) => ({ seq: row.seq, entry: row.entry, traceId: null })),
      nextCursor: hasMore ? (kept.at(-1)?.seq ?? null) : null,
    });
  }

  ownershipOf(): Promise<SessionTrailOwnership> {
    return Promise.resolve('none');
  }

  usageOf(
    userId: UserId,
    ruleIds: readonly string[],
    windowStart: Date,
  ): Promise<ReadonlyMap<string, RuleUsage>> {
    const usage = new Map<string, RuleUsage>();

    for (const row of this.rows) {
      if (!countsTowardUsage(row, userId, ruleIds, windowStart)) {
        continue;
      }

      const existing = usage.get(row.ruleId as string);
      usage.set(row.ruleId as string, {
        count: (existing?.count ?? 0) + 1,
        lastUsedAt: latestOf(existing?.lastUsedAt ?? null, row.entry.at),
      });
    }

    return Promise.resolve(usage);
  }

  decided(userId: UserId, limit: number): Promise<readonly DecidedInvocation[]> {
    const matching = this.rows
      .filter((row) => row.userId.equals(userId) && row.entry.decision !== 'recorded')
      .sort((a, b) => b.seq - a.seq)
      .slice(0, limit);

    return Promise.resolve(
      matching.map((row) => ({
        record: { seq: row.seq, entry: row.entry, traceId: null },
        folder: row.folder ?? null,
      })),
    );
  }
}

function countsTowardUsage(
  row: StoredAuditEntry,
  userId: UserId,
  ruleIds: readonly string[],
  windowStart: Date,
): boolean {
  return (
    row.userId.equals(userId) &&
    row.ruleId !== null &&
    ruleIds.includes(row.ruleId) &&
    row.entry.at.getTime() >= windowStart.getTime()
  );
}

function latestOf(a: Date | null, b: Date): Date {
  return a === null || b > a ? b : a;
}

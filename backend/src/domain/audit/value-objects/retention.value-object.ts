/**
 * How long the trail is kept, at the very least.
 *
 * The same number lives in the trigger of each trail table, as `interval '2160 hours'`, and it is
 * the trigger that survives a bug of ours: this constant decides what the purge **tries** to
 * delete, the trigger decides what the database **lets** it delete
 * ([D-08](../../../../../docs/plans/03-rules-and-audit/decisions.md)). Hours and not calendar
 * days on both sides, so that the two never disagree about where the floor is in a time zone with
 * daylight saving ([D-21](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export const AUDIT_RETENTION_FLOOR_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The instant before which an entry is outside the retention window.
 *
 * Strictly before: an entry written exactly `retentionDays` ago is still inside, and kept (S-36).
 */
export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * The two tables the purge sweeps: the invocations, and the account events
 * ([D-20](../../../../../docs/plans/03-rules-and-audit/decisions.md)). The record of the purge
 * itself is not one of them — it is never purged.
 */
export const AUDIT_TRAILS = ['entries', 'events'] as const;

export type AuditTrail = (typeof AUDIT_TRAILS)[number];

/**
 * Who started a purge: the internal job, or somebody at the command line. "Nobody knows who" is
 * half a trace, and a purge is the one operation that removes the rest of it.
 */
export const AUDIT_PURGE_TRIGGERS = ['job', 'cli'] as const;

export type AuditPurgeTrigger = (typeof AUDIT_PURGE_TRIGGERS)[number];

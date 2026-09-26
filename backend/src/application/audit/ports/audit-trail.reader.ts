import type { AuditDecision, AuditEntry } from '@domain/audit';
import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';

/**
 * Which part of somebody's trail to read. Always somebody's: `userId` is not optional.
 *
 * The period is **half-open** — `from` included, `to` excluded — so two consecutive windows never
 * both hold the entry that falls on their shared edge, and none falls between them (S-24).
 */
export interface AuditTrailFilter {
  readonly userId: UserId;
  readonly sessionId: SessionId | null;
  readonly toolName: string | null;
  readonly decision: AuditDecision | null;

  /** Inclusive. */
  readonly from: Date | null;

  /** Exclusive. */
  readonly to: Date | null;
}

/** One page of it: the filter, where to start, and how many. */
export interface AuditTrailPageRequest extends AuditTrailFilter {
  /**
   * The keyset cursor: only entries with a `seq` **below** it. `null` is the top of the trail.
   *
   * Descending over `seq`, never over `at` ([D-06](../../../../../docs/plans/03-rules-and-audit/decisions.md)):
   * a write that lands while somebody pages enters above the window already read, never inside it.
   */
  readonly before: number | null;

  readonly limit: number;
}

/** An entry as the trail holds it, with what only the storage knows about it. */
export interface AuditTrailRecord {
  /** The position in the trail — what the cursor of the next page is made of. */
  readonly seq: number;

  readonly entry: AuditEntry;

  /**
   * The trace the entry was written under, which is what leads from the record to the log and to
   * the events of the same turn. `null` on an entry written outside any trace ([D-16](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
   */
  readonly traceId: string | null;
}

export interface AuditTrailPage {
  readonly records: readonly AuditTrailRecord[];

  /** The cursor of the page after this one, or `null` when this is the last. */
  readonly nextCursor: number | null;
}

/**
 * Whose a session's trail is, as far as the trail can say.
 *
 * `none` is a session with no entry at all — which is not a session of somebody else's, because
 * nothing says whose it is ([D-17](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export type SessionTrailOwnership = 'mine' | 'others' | 'none';

/**
 * How the trail is **read**.
 *
 * A port of its own and not a method on {@link import('./audit.repository').AuditRepository}, and
 * the separation is the rule rather than a style: `audit` is write-only to every other module, and
 * the module that writes the trail never gets a way to read it back. This port is wired only into
 * the query, which sits outside the flow (docs/architecture/backend/03-modules.md#audit).
 */
export interface AuditTrailReader {
  page(request: AuditTrailPageRequest): Promise<AuditTrailPage>;

  /** Whether the entries of a session are this person's, somebody else's, or nobody's yet. */
  ownershipOf(sessionId: SessionId, userId: UserId): Promise<SessionTrailOwnership>;
}

export const AUDIT_TRAIL_READER = Symbol('AuditTrailReader');

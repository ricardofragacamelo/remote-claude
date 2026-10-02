import type { AuditEvent } from '@domain/audit';
import type { UserId } from '@domain/auth';

/** One page of somebody's account facts. Always somebody's: `userId` is not optional. */
export interface AuditEventPageRequest {
  readonly userId: UserId;

  /** Only kinds that start with this — `file.` for every fact about the person's files. */
  readonly kindPrefix: string | null;

  /** Keyset cursor: only facts with a `seq` **below** it. `null` is the newest. */
  readonly before: number | null;

  readonly limit: number;
}

/** A fact as the trail holds it, with its position — what the next cursor is made of. */
export interface AuditEventRecord {
  readonly seq: number;
  readonly event: AuditEvent;
}

export interface AuditEventPage {
  readonly records: readonly AuditEventRecord[];

  /** The cursor of the page after this one, or `null` when this is the last. */
  readonly nextCursor: number | null;
}

/**
 * How the account facts are **read** — by the query outside the flow, and by nothing else.
 *
 * The same discipline as {@link import('./audit-trail.reader').AuditTrailReader}: a port of its own,
 * wired only into the query, so `audit` stays write-only to every module that writes it
 * ([07 · D-13](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-13--onde-os-fatos-de-arquivo-aparecem-na-trilha)).
 */
export interface AuditEventReader {
  page(request: AuditEventPageRequest): Promise<AuditEventPage>;
}

export const AUDIT_EVENT_READER = Symbol('AuditEventReader');

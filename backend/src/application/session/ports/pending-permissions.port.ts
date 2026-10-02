import type { SessionId } from '@domain/session';

/**
 * How many questions a live session is holding its loop open for.
 *
 * The `permission` module owns the questions; `session` only needs the count, for the row of the
 * list of live sessions that says a person is being waited on (plan 08, B-07).
 */
export interface PendingPermissions {
  countFor(sessionId: SessionId): number;
}

export const PENDING_PERMISSIONS = Symbol('PendingPermissions');

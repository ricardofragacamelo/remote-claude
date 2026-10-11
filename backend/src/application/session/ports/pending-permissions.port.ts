import type { CanonicalTool } from '@domain/engine';
import type { SessionId } from '@domain/session';

/**
 * The questions a live session is holding its loop open for.
 *
 * The `permission` module owns the questions; `session` only needs the count, for the row of the
 * list of live sessions that says a person is being waited on (plan 08, B-07), and the call one of
 * them is about, for the diff of a call not yet run (plan 28, B-17).
 */
export interface PendingPermissions {
  countFor(sessionId: SessionId): number;

  /** The call a pending question of [sessionId] is about, by its `toolUseId` — `null` when none is. */
  toolOf(sessionId: SessionId, toolUseId: string): CanonicalTool | null;
}

export const PENDING_PERMISSIONS = Symbol('PendingPermissions');

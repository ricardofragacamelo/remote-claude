import type { UserId } from '@domain/auth';
import type { PermissionDecision, PermissionRequestStatus } from '@domain/permission';

/**
 * How a question of Claude ended, as `permission_requests` kept it — what the history of a session
 * joins to the line of its tool, by the tool call (plan 24, D-13).
 */
export interface QuestionRecord {
  readonly status: PermissionRequestStatus;
  readonly decision: PermissionDecision | null;

  /** Why it was refused, on a refusal. */
  readonly reason: string | null;

  /** What was answered, as the contract carries it — `null` when nothing was. */
  readonly answers: unknown;
}

/**
 * The questions this backend asked and recorded, by the tool call they were about.
 *
 * Read, never written: the record is the one the permission flow already keeps. A question answered
 * in another client has none, and the history shows what the transcript says of it.
 */
export interface QuestionRecordSource {
  /**
   * The record of each of `toolUseIds` that this person's requests have — the latest, when the same
   * call was asked about twice. A call with none is simply absent.
   */
  recordsOf(
    userId: UserId,
    toolUseIds: readonly string[],
  ): Promise<ReadonlyMap<string, QuestionRecord>>;
}

export const QUESTION_RECORD_SOURCE = Symbol('QuestionRecordSource');

import type { SessionNoticePayload } from '@remote-claude/contracts';

/** A row of `persisted_notices`, as Drizzle reads it back — before it becomes a payload again. */
export interface PersistedNoticeRow {
  readonly payload: Record<string, unknown>;
  readonly recordedAt: Date;
}

/**
 * The payload as it was recorded, with `at` filled in from when this store wrote it when the
 * payload itself carries none — every live notice (B-18's `at` is a history-only convention; this
 * store follows the same one for what it reconstructs).
 */
export function toPayload(row: PersistedNoticeRow): SessionNoticePayload {
  const payload = row.payload as unknown as SessionNoticePayload;
  return payload.at === undefined ? { ...payload, at: row.recordedAt.toISOString() } : payload;
}

import type {
  AuditTrailPagePayload,
  AuditTrailPagePayloadEntriesItem,
  AuditTrailPagePayloadEntriesItemVerdict,
} from '@remote-claude/contracts';

/** What the system did about an invocation. `recorded` is the hook's, before anybody voted. */
export type AuditDecision = AuditTrailPagePayloadEntriesItem['decision'];

export const AUDIT_DECISIONS: readonly AuditDecision[] = ['recorded', 'allowed', 'denied'];

/** How far an answer reaches. The same four the permission card offers. */
export type AuditScope = AuditTrailPagePayloadEntriesItemVerdict['scope'];

/**
 * What a decision was, as the entry that records it says.
 *
 * Only on an `allowed` or `denied` entry — and not even on every one: a decision written before
 * the trail kept this has none, and the screen says so rather than inventing it.
 */
export type AuditVerdict = AuditTrailPagePayloadEntriesItemVerdict;

/**
 * One entry of the trail (`GET /audit-entries`).
 *
 * Without the canonical `kind`: the trail keeps the engine's own `toolName` for what a row shows
 * (plan 28, F7) — the title of a request is by kind only while it is live, never once it is history.
 */
export type AuditEntry = Omit<AuditTrailPagePayloadEntriesItem, 'kind'>;

/**
 * What the trail is filtered by. Every field is optional, and they live in the URL: a filtered
 * trail pasted on another device is the same screen.
 */
export interface AuditFilters {
  readonly sessionId?: string;
  readonly toolName?: string;
  readonly decision?: AuditDecision;

  /** ISO 8601, included. */
  readonly from?: string;

  /** ISO 8601, excluded. */
  readonly to?: string;
}

/** One page, and the cursor of the next — opaque, and `null` on the last. */
export type AuditPage = Omit<AuditTrailPagePayload, 'entries'> & {
  readonly entries: readonly AuditEntry[];
};

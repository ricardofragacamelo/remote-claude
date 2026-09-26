/** What the system did about an invocation. `recorded` is the hook's, before anybody voted. */
export type AuditDecision = 'recorded' | 'allowed' | 'denied';

export const AUDIT_DECISIONS: readonly AuditDecision[] = ['recorded', 'allowed', 'denied'];

/** How far an answer reaches. The same four the permission card offers. */
export type AuditScope = 'once' | 'session' | 'project' | 'always';

/**
 * What a decision was, as the entry that records it says.
 *
 * Only on an `allowed` or `denied` entry — and not even on every one: a decision written before
 * the trail kept this has none, and the screen says so rather than inventing it.
 */
export interface AuditVerdict {
  readonly requestId: string;

  /** The server decided with nobody answering: a rule, or the deadline. */
  readonly auto: boolean;

  /** The rule that answered, when one did. */
  readonly ruleId: string | null;

  readonly scope: AuditScope;

  /** Who answered. `null` on the refusal nobody made. */
  readonly resolvedBy: string | null;

  readonly resolvedFrom: 'web' | 'mobile' | null;
}

/** One entry of the trail. */
export interface AuditEntry {
  readonly id: string;
  readonly sessionId: string;
  readonly toolUseId: string | null;
  readonly toolName: string;

  /** Exactly as the tool was called — a `Read` shows where and how much, never what it read. */
  readonly input: Readonly<Record<string, unknown>>;

  readonly decision: AuditDecision;

  /** ISO 8601. */
  readonly at: string;

  /** What leads to the log lines and the events of the same command. */
  readonly traceId: string | null;

  readonly verdict: AuditVerdict | null;
}

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
export interface AuditPage {
  readonly entries: readonly AuditEntry[];
  readonly nextCursor: string | null;
}

import type { UserId } from '@domain/auth';
import type { ToolKind } from '@domain/engine';
import type { PermissionOrigin, PermissionScope } from '@domain/permission';
import type { SessionId } from '@domain/session';
import { ToolInput } from '../value-objects/tool-input.value-object';

/** What the system did about an invocation. `recorded` is the trail of the hook, before any vote. */
export const AUDIT_DECISIONS = ['recorded', 'allowed', 'denied'] as const;

export type AuditDecision = (typeof AUDIT_DECISIONS)[number];

/** Whether `value` is a decision this build knows. Used where a row or a query is read. */
export function isAuditDecision(value: string): value is AuditDecision {
  return (AUDIT_DECISIONS as readonly string[]).includes(value);
}

/** Where a request came from, as far as the backend can honestly tell. */
export interface AuditOrigin {
  /** The approved device, when the action came through one. */
  readonly deviceId: string | null;

  /** The address the connection came from. */
  readonly ip: string | null;
}

/**
 * What a decision was, carried by the entry that records it.
 *
 * Written with the entry rather than looked up when the trail is read: the question "who
 * authorised this command?" is answered by the trail alone, and never by a table of another module
 * that is rewritten as a request moves on ([D-15](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 *
 * Only an `allowed` or `denied` entry has one. The hook's `recorded` entry fires before anybody has
 * voted, and a verdict on it would be the trail claiming a decision that has not been taken.
 */
export interface AuditVerdict {
  /** The permission request the decision settled. */
  readonly requestId: string;

  /** The server decided, with nobody answering — a rule, or the deadline. */
  readonly auto: boolean;

  /** The rule that answered, when one did. Only ever on an automatic decision. */
  readonly ruleId: string | null;

  /** How far the answer reaches. */
  readonly scope: PermissionScope;

  /** Who answered. `null` on the refusal nobody made. */
  readonly resolvedBy: UserId | null;

  /** Where the answer came from. `null` when nobody answered. */
  readonly resolvedFrom: PermissionOrigin | null;
}

/** What writing an entry needs to know. */
export interface AuditEntryDraft {
  readonly id: string;
  readonly userId: UserId;
  readonly sessionId: SessionId;
  readonly toolUseId: string | null;
  readonly toolName: string;

  /**
   * The canonical kind of the call, as the engine's adapter read it — beside the engine's name of
   * the tool, which stays. Absent or `null` on an entry written before the trail kept it, until the
   * data step at boot gives it one (plan 28, B-33).
   */
  readonly toolKind?: ToolKind | null;
  readonly input: Readonly<Record<string, unknown>>;
  readonly decision: AuditDecision;
  readonly origin: AuditOrigin;
  readonly at: Date;

  /** What was decided, on a decision entry. Absent means none — which is what `recorded` is. */
  readonly verdict?: AuditVerdict | null;
}

/**
 * The persisted shape, as the mapper on either side of the repository sees it.
 *
 * Derived from the draft rather than written out again: the two differ in two fields — the input
 * has been captured, and the verdict is always stated, `null` when there is none — and restating
 * the other eight is how they come to disagree.
 */
export type AuditEntrySnapshot = Omit<AuditEntryDraft, 'input' | 'verdict' | 'toolKind'> & {
  readonly input: ToolInput;
  readonly verdict: AuditVerdict | null;
  readonly toolKind: ToolKind | null;
};

/**
 * One invocation of a tool, for ever.
 *
 * `who`, `what`, `when`, `where` and the exact input — the five things the question "who
 * authorised this command?" needs answered, on a system that runs `Bash` on somebody's machine.
 *
 * **There is no setter and no mutator.** Not as a convention: the class has no method that changes
 * anything, the repository exposes no operation but write and read, and the table itself aborts
 * `UPDATE` through a trigger. A trail the system can rewrite is not a trail, and the three layers
 * say so independently — see docs/architecture/backend/05-persistence.md#a-trilha-de-auditoria.
 */
export class AuditEntry {
  private constructor(
    readonly id: string,
    readonly userId: UserId,
    readonly sessionId: SessionId,
    readonly toolUseId: string | null,
    readonly toolName: string,
    readonly toolKind: ToolKind | null,
    readonly input: ToolInput,
    readonly decision: AuditDecision,
    readonly origin: AuditOrigin,
    readonly at: Date,
    readonly verdict: AuditVerdict | null,
  ) {}

  /** An invocation, as the `PreToolUse` hook saw it. */
  static record(draft: AuditEntryDraft): AuditEntry {
    return new AuditEntry(
      draft.id,
      draft.userId,
      draft.sessionId,
      draft.toolUseId,
      draft.toolName,
      draft.toolKind ?? null,
      ToolInput.capture(draft.input),
      draft.decision,
      { deviceId: draft.origin.deviceId, ip: draft.origin.ip },
      draft.at,
      draft.verdict ?? null,
    );
  }

  /** Rehydrates an entry the repository read back. */
  static restore(snapshot: AuditEntrySnapshot): AuditEntry {
    return new AuditEntry(
      snapshot.id,
      snapshot.userId,
      snapshot.sessionId,
      snapshot.toolUseId,
      snapshot.toolName,
      snapshot.toolKind,
      snapshot.input,
      snapshot.decision,
      snapshot.origin,
      snapshot.at,
      snapshot.verdict,
    );
  }

  snapshot(): AuditEntrySnapshot {
    return {
      id: this.id,
      userId: this.userId,
      sessionId: this.sessionId,
      toolUseId: this.toolUseId,
      toolName: this.toolName,
      toolKind: this.toolKind,
      input: this.input,
      decision: this.decision,
      origin: this.origin,
      at: this.at,
      verdict: this.verdict,
    };
  }
}

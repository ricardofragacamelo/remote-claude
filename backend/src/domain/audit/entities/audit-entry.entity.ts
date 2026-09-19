import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import { ToolInput } from '../value-objects/tool-input.value-object';

/** What the system did about an invocation. `recorded` is the trail of the hook, before any vote. */
export type AuditDecision = 'recorded' | 'allowed' | 'denied';

/** Where a request came from, as far as the backend can honestly tell. */
export interface AuditOrigin {
  /** The approved device, when the action came through one. */
  readonly deviceId: string | null;

  /** The address the connection came from. */
  readonly ip: string | null;
}

/** What writing an entry needs to know. */
export interface AuditEntryDraft {
  readonly id: string;
  readonly userId: UserId;
  readonly sessionId: SessionId;
  readonly toolUseId: string | null;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly decision: AuditDecision;
  readonly origin: AuditOrigin;
  readonly at: Date;
}

/**
 * The persisted shape, as the mapper on either side of the repository sees it.
 *
 * Derived from the draft rather than written out again: the two differ in exactly one field — the
 * input has been captured — and restating the other eight is how they come to disagree.
 */
export type AuditEntrySnapshot = Omit<AuditEntryDraft, 'input'> & { readonly input: ToolInput };

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
    readonly input: ToolInput,
    readonly decision: AuditDecision,
    readonly origin: AuditOrigin,
    readonly at: Date,
  ) {}

  /** An invocation, as the `PreToolUse` hook saw it. */
  static record(draft: AuditEntryDraft): AuditEntry {
    return new AuditEntry(
      draft.id,
      draft.userId,
      draft.sessionId,
      draft.toolUseId,
      draft.toolName,
      ToolInput.capture(draft.input),
      draft.decision,
      { deviceId: draft.origin.deviceId, ip: draft.origin.ip },
      draft.at,
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
      snapshot.input,
      snapshot.decision,
      snapshot.origin,
      snapshot.at,
    );
  }

  snapshot(): AuditEntrySnapshot {
    return {
      id: this.id,
      userId: this.userId,
      sessionId: this.sessionId,
      toolUseId: this.toolUseId,
      toolName: this.toolName,
      input: this.input,
      decision: this.decision,
      origin: this.origin,
      at: this.at,
    };
  }
}

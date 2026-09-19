import type { PermissionRequest, PermissionRule } from '@domain/permission';
import type { SessionId } from '@domain/session';
import type { UserId } from '@domain/auth';
import type { CancelScheduled } from '@application/shared';

/**
 * The requests that are open, the deadlines armed for them, and the rules that answer without
 * asking.
 *
 * **In memory, and that is the design.** An entry is a promise the SDK is holding its agent loop
 * open for; none of that survives a restart, so a table of pending requests would be a table of
 * rows that are all lies the moment the process dies. The *history* of what was asked does go to
 * PostgreSQL — that is a different question, answered by `PermissionRequestRepository`.
 *
 * It is also what makes reconnection work without `query.reinitialize()`. The gap a product
 * suffers is between the client and us; the SDK channel never dropped, so the promise is still
 * pending here and the pending requests can simply be published again
 * ([ADR-012](../../../../docs/architecture/shared/00-decisions.md)).
 *
 * Settled requests are **kept** rather than deleted, until the session goes. That is what makes an
 * answer that arrives late a silent ack instead of a `PERMISSION_REQUEST_NOT_FOUND`, and a request
 * the SDK redelivers after a transport gap an idempotent no-op instead of a second execution.
 */
export class PermissionRegistry {
  private readonly requests = new Map<string, PermissionRequest>();
  private readonly deadlines = new Map<string, CancelScheduled>();
  private readonly rules = new Map<string, PermissionRule[]>();

  /** The request with that id, settled or not, or `null` when this process never saw it. */
  find(requestId: string): PermissionRequest | null {
    return this.requests.get(requestId) ?? null;
  }

  add(request: PermissionRequest): void {
    this.requests.set(request.id, request);
  }

  /** The open questions of a session, oldest first — what a reconnecting client has to be told. */
  pendingFor(sessionId: SessionId): readonly PermissionRequest[] {
    return [...this.requests.values()].filter(
      (request) => request.isPending && request.sessionId.equals(sessionId),
    );
  }

  /** Arms the deadline of a request, replacing whatever was armed before. */
  arm(requestId: string, cancel: CancelScheduled): void {
    this.disarm(requestId);
    this.deadlines.set(requestId, cancel);
  }

  /** Cancels the deadline of a request. Disarming one that has none is not an error. */
  disarm(requestId: string): void {
    this.deadlines.get(requestId)?.();
    this.deadlines.delete(requestId);
  }

  /** Remembers a rule for as long as its session lives. */
  addRule(rule: PermissionRule): void {
    const sessionId = rule.sessionId;
    if (sessionId === null) {
      return;
    }

    const existing = this.rules.get(sessionId.value) ?? [];
    existing.push(rule);
    this.rules.set(sessionId.value, existing);
  }

  /**
   * The rule that answers this invocation, or `null`.
   *
   * `userId` is part of the question and not only of the rule's creation: a rule of one person
   * answering another's request would turn "I trust this command" into "anybody on this machine
   * trusts this command".
   */
  matchingRule(
    sessionId: SessionId,
    userId: UserId,
    toolName: string,
    input: Readonly<Record<string, unknown>>,
    now: Date,
  ): PermissionRule | null {
    const candidates = this.rules.get(sessionId.value) ?? [];

    return candidates.find((rule) => rule.matches(userId, toolName, input, now)) ?? null;
  }

  /** Every rule of a session, expired ones included — "gone" and "stopped applying" differ. */
  rulesOf(sessionId: SessionId): readonly PermissionRule[] {
    return this.rules.get(sessionId.value) ?? [];
  }

  /**
   * Drops everything a session left behind, and says what was still open.
   *
   * The caller settles those: a request whose session has gone is a question nobody can answer any
   * more, and leaving it pending would leave a row in the history that says a human is still
   * thinking about it.
   */
  forgetSession(sessionId: SessionId): readonly PermissionRequest[] {
    const pending = this.pendingFor(sessionId);

    for (const [id, request] of this.requests) {
      if (request.sessionId.equals(sessionId)) {
        this.disarm(id);
        this.requests.delete(id);
      }
    }

    this.rules.delete(sessionId.value);

    return pending;
  }
}

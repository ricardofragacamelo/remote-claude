import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';
import { InvalidSessionTransitionError } from '../errors/invalid-session-transition.error';
import { SessionClosedError } from '../errors/session-closed.error';
import type { PermissionMode } from '../value-objects/permission-mode.value-object';
import type { SessionId } from '../value-objects/session-id.value-object';
import { canTransition } from '../value-objects/session-status.value-object';
import type { SessionStatus } from '../value-objects/session-status.value-object';

/** Why a session ended. The contract carries the same five. */
export type SessionCloseReason =
  'closedByUser' | 'completed' | 'failed' | 'auditUnavailable' | 'shutdown';

/** What opening a session needs to know. */
export interface SessionOpening {
  readonly id: SessionId;
  readonly ownerId: UserId;
  readonly workspace: WorkspacePath;
  readonly model: string;
  readonly permissionMode: PermissionMode;
  readonly openedAt: Date;
}

/**
 * A live session of Claude.
 *
 * It is a rule and no I/O: the subprocess, the socket and the database are all somewhere else, and
 * what lives here is the question "may this session do that now?". That is why the state machine
 * is worth having at all — it is the one place where "a prompt arrived while a tool was running"
 * has a single answer, instead of one answer per call site.
 *
 * It is **not** persisted. A live session is process state and dies with the process; the database
 * holds provenance and the audit trail, never the runner. See
 * docs/architecture/backend/06-realtime.md.
 */
export class Session {
  private constructor(
    readonly id: SessionId,
    readonly ownerId: UserId,
    readonly workspace: WorkspacePath,
    readonly openedAt: Date,
    private currentModel: string,
    private currentMode: PermissionMode,
    private currentStatus: SessionStatus,
    private reason: SessionCloseReason | null,
  ) {}

  /** A session that has been asked for and whose subprocess is not up yet. */
  static open(opening: SessionOpening): Session {
    return new Session(
      opening.id,
      opening.ownerId,
      opening.workspace,
      opening.openedAt,
      opening.model,
      opening.permissionMode,
      'starting',
      null,
    );
  }

  get status(): SessionStatus {
    return this.currentStatus;
  }

  get model(): string {
    return this.currentModel;
  }

  get permissionMode(): PermissionMode {
    return this.currentMode;
  }

  /** Why it ended, or `null` while it has not. */
  get closeReason(): SessionCloseReason | null {
    return this.reason;
  }

  get isClosed(): boolean {
    return this.currentStatus === 'closed';
  }

  /** Whether this session belongs to `userId`. */
  isOwnedBy(userId: UserId): boolean {
    return this.ownerId.equals(userId);
  }

  /**
   * Moves the machine **if** it allows the move, and says whether it did.
   *
   * This is the door the event stream comes through, and it is separate from {@link moveTo} on
   * purpose. A status derived from somebody else's stream is an **observation**, not a command:
   * if the SDK ever reorders its messages, or emits one we read differently, the honest outcome
   * is to keep the status we had and carry on — the same survival rule the mapper applies to a
   * variant it does not know. A session on the user's machine must not end because a message
   * arrived in an order this build did not expect.
   *
   * {@link moveTo} stays strict, because a transition asked for by our own code is a claim about
   * our own logic, and a wrong one there is a bug worth failing on.
   */
  observe(status: SessionStatus): boolean {
    if (status === this.currentStatus) {
      return true;
    }

    if (!canTransition(this.currentStatus, status)) {
      return false;
    }

    this.currentStatus = status;
    return true;
  }

  /**
   * Moves the machine.
   *
   * Asking for the status it already has is a no-op and not an error: the SDK reports the same
   * thing twice often enough — two tools in a row both report `running` — and treating that as a
   * violation would turn ordinary streams into crashes.
   *
   * @throws {InvalidSessionTransitionError} when the move is not one the machine makes
   */
  moveTo(status: SessionStatus): void {
    if (status === this.currentStatus) {
      return;
    }

    if (!canTransition(this.currentStatus, status)) {
      throw new InvalidSessionTransitionError(this.id.value, this.currentStatus, status);
    }

    this.currentStatus = status;
  }

  /**
   * Ends the session.
   *
   * Idempotent, and deliberately so: closing is what runs in a `finally`, in a shutdown hook and
   * from a command, and any two of those can happen at once. The **first** reason is the one that
   * sticks — the later one is a consequence of the first, and overwriting would replace the cause
   * with its effect.
   */
  close(reason: SessionCloseReason): void {
    if (this.isClosed) {
      return;
    }

    this.currentStatus = 'closed';
    this.reason = reason;
  }

  /** @throws {SessionClosedError} when the session is over */
  setModel(model: string): void {
    this.refuseIfClosed();
    this.currentModel = model;
  }

  /** @throws {SessionClosedError} when the session is over */
  setPermissionMode(mode: PermissionMode): void {
    this.refuseIfClosed();
    this.currentMode = mode;
  }

  private refuseIfClosed(): void {
    if (this.isClosed) {
      throw new SessionClosedError(this.id.value);
    }
  }
}

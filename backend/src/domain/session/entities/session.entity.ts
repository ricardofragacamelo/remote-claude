import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';
import { InvalidSessionTransitionError } from '../errors/invalid-session-transition.error';
import { SessionClosedError } from '../errors/session-closed.error';
import { SessionLockedError } from '../errors/session-locked.error';
import { PromptQueue } from './prompt-queue.entity';
import type { PermissionMode } from '../value-objects/permission-mode.value-object';
import type { SessionId } from '../value-objects/session-id.value-object';
import { canTransition } from '../value-objects/session-status.value-object';
import type { SessionStatus } from '../value-objects/session-status.value-object';

/**
 * Why a session ended. The contract carries the same six.
 *
 * `idleTimeout` is the installation reclaiming a subprocess nobody used for longer than the TTL —
 * said on its own, so a client can tell "it went quiet and was put away" from "it failed" (D-02).
 */
export type SessionCloseReason =
  'closedByUser' | 'completed' | 'failed' | 'auditUnavailable' | 'shutdown' | 'idleTimeout';

/**
 * Which client a session was opened from: a browser, or the app on a phone.
 *
 * Said in the list of live sessions (plan 08, B-07), so "opened on your phone 10 min ago" is
 * something the screen can say. It is a fact of the socket that asked — the handshake of the app
 * declares an installation, a browser's declares none.
 */
export type SessionClient = 'web' | 'mobile';

/** What opening a session needs to know. */
export interface SessionOpening {
  readonly id: SessionId;
  readonly ownerId: UserId;
  readonly workspace: WorkspacePath;
  readonly model: string;
  readonly permissionMode: PermissionMode;
  readonly openedAt: Date;
  readonly openedFrom: SessionClient;
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
  /** Whether an undo is putting files back right now. */
  private rewinding = false;

  /** The prompts waiting for the running turn to end — the backend's queue (plan 08, D-14). */
  readonly prompts = new PromptQueue();

  private constructor(
    readonly id: SessionId,
    readonly ownerId: UserId,
    readonly workspace: WorkspacePath,
    readonly openedAt: Date,
    readonly openedFrom: SessionClient,
    private currentModel: string,
    private currentMode: PermissionMode,
    private currentStatus: SessionStatus,
    private reason: SessionCloseReason | null,
    private lastActivity: Date,
  ) {}

  /** A session that has been asked for and whose subprocess is not up yet. */
  static open(opening: SessionOpening): Session {
    return new Session(
      opening.id,
      opening.ownerId,
      opening.workspace,
      opening.openedAt,
      opening.openedFrom,
      opening.model,
      opening.permissionMode,
      'starting',
      null,
      opening.openedAt,
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

  /** The last time Claude said something or a human did something here. */
  get lastActivityAt(): Date {
    return this.lastActivity;
  }

  /**
   * Something happened: an event of Claude, or an action of a human.
   *
   * Only ever moves forward. Two events handled out of order must not make a session look older
   * than it is, because an older session is one closer to being reclaimed.
   */
  recordActivity(at: Date): void {
    if (at.getTime() > this.lastActivity.getTime()) {
      this.lastActivity = at;
    }
  }

  /**
   * Whether this session has sat with nothing happening for at least `ttlMs`.
   *
   * **Only `idle` can be idle.** A running turn is not, however long the tool takes, and neither is
   * a session waiting for permission: that wait is the product working, and closing it would kill
   * exactly the flow the product exists for (S-05). `starting` is not either — it has not yet had
   * the chance to be used — and `closed` is past the question.
   */
  isIdleFor(ttlMs: number, now: Date): boolean {
    return this.currentStatus === 'idle' && now.getTime() - this.lastActivity.getTime() >= ttlMs;
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
    this.prompts.drain();
  }

  /** Whether an undo is putting this session's files back right now. */
  get isRewinding(): boolean {
    return this.rewinding;
  }

  /**
   * Takes the lock an undo holds while files go back.
   *
   * Refused while a turn runs — files put back underneath a model that is reading and writing them
   * leave the turn carrying on from a disk it never saw — and refused while another undo holds it
   * (S-43 of plan 04).
   *
   * @throws {SessionLockedError} a turn is running, or another undo is
   */
  beginRewind(): void {
    if (this.currentStatus !== 'idle') {
      throw new SessionLockedError(this.id.value, 'turnRunning');
    }
    if (this.rewinding) {
      throw new SessionLockedError(this.id.value, 'rewindRunning');
    }

    this.rewinding = true;
  }

  /** Gives the lock back. Giving back one nobody holds is not an error: it runs in a `finally`. */
  endRewind(): void {
    this.rewinding = false;
  }

  /**
   * Refuses a prompt while an undo holds the lock.
   *
   * The other half of the lock, and the half plan 04 left open: the undo refused to start during
   * a turn, but a prompt could still start a turn while the files were going back — the model
   * then reading a disk halfway between two states (B-27).
   *
   * @throws {SessionLockedError} an undo is running
   */
  refusePromptWhileRewinding(): void {
    if (this.rewinding) {
      throw new SessionLockedError(this.id.value, 'rewindRunning');
    }
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

import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import { PermissionExtensionLimitReachedError } from '../errors/permission-extension-limit.error';
import { PermissionReasonRequiredError } from '../errors/permission-reason-required.error';
import { PermissionRequestExpiredError } from '../errors/permission-request-expired.error';
import { PermissionRequestNotFoundError } from '../errors/permission-request-not-found.error';
import type { PermissionScope } from '../value-objects/permission-scope.value-object';
import type { RiskHint } from '../value-objects/risk-hint.value-object';

/** Yes or no. There is no third value: silence is handled by the deadline, and it denies. */
export type PermissionDecision = 'allow' | 'deny';

/** Where an answer came from, as far as the backend can honestly tell. */
export type PermissionOrigin = 'web' | 'mobile';

/** Whether a request is still blocking the agent loop, and how it stopped. */
export type PermissionRequestStatus = 'pending' | 'resolved' | 'expired';

/** How a request was settled. */
export interface PermissionAnswer {
  readonly decision: PermissionDecision;

  /** Why it was refused. `null` only on the automatic refusal nobody made. */
  readonly reason: string | null;

  readonly scope: PermissionScope;

  /** Who answered. `null` only when nobody did and the server decided. */
  readonly resolvedBy: UserId | null;

  readonly resolvedFrom: PermissionOrigin | null;

  /**
   * The server settled it with nobody answering.
   *
   * Either the deadline passed or a rule matched. Silence never authorises, so an automatic
   * decision is `deny` unless a rule allowed it.
   */
  readonly auto: boolean;

  /**
   * The rule that answered, when one did — and absent otherwise.
   *
   * It is what lets somebody who finds a command that ran without being asked go from the record
   * to the authorisation, including one that has since been revoked.
   */
  readonly ruleId?: string;

  readonly at: Date;
}

/** How a request was settled, once it has been. Identical to the answer that settled it. */
export type PermissionResolution = PermissionAnswer;

/** The outcome of answering: who won, and the decision that counts. */
export interface PermissionSettling {
  /** `true` when this answer is the one that settled the request. */
  readonly won: boolean;

  /** The decision that reached the SDK — not necessarily the one just offered. */
  readonly resolution: PermissionResolution;
}

/** What one extension did to a deadline. */
export interface PermissionExtension {
  readonly expiresAt: Date;

  /** How many are left afterwards — what stops a UI offering one that no longer exists. */
  readonly remainingExtensions: number;

  /** `false` when the deadline already reached that far and nothing was spent. */
  readonly changed: boolean;
}

/** What opening a request needs to know. */
export interface PermissionRequestOpening {
  /** The idempotency key. It is the SDK's `requestId`, never the `toolUseId`. */
  readonly id: string;

  readonly sessionId: SessionId;

  /** The owner of the session. A rule of one user never resolves the request of another. */
  readonly userId: UserId;

  /**
   * The workspace root the session runs in — what a `project` rule is granted for.
   *
   * `null` when it could not be told, and then no `project` rule reaches the request and none can
   * be granted from it: a rule for "whatever project this was" is a rule nobody can read.
   */
  readonly projectPath: string | null;

  readonly toolUseId: string | null;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly riskHint: RiskHint;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
}

/**
 * One question put to a human, while the agent loop waits for the answer.
 *
 * This entity is the fence of the product, and everything about it is written so that the unsafe
 * outcome needs an explicit act:
 *
 * - **the first answer wins.** Several clients watch one session and a client may resend after
 *   reconnecting, so {@link resolve} reports who won rather than throwing. A second answer is a
 *   silent ack, never an error and never a second execution;
 * - **a person who refuses says why**, and the entity will not be settled by one who does not;
 * - **the deadline denies.** {@link PermissionRequest.expiry} is the answer silence gives, and it
 *   is a refusal with no author and no reason;
 * - **extending is bounded.** Our deadline is the only protection there is against a session that
 *   hangs for ever, so moving it has a hard ceiling.
 */
export class PermissionRequest {
  private settled: PermissionResolution | null = null;
  private extensions = 0;
  private deadline: Date;

  private constructor(
    readonly id: string,
    readonly sessionId: SessionId,
    readonly userId: UserId,
    readonly projectPath: string | null,
    readonly toolUseId: string | null,
    readonly toolName: string,
    readonly input: Readonly<Record<string, unknown>>,
    readonly riskHint: RiskHint,
    readonly requestedAt: Date,
    expiresAt: Date,
  ) {
    this.deadline = expiresAt;
  }

  static open(opening: PermissionRequestOpening): PermissionRequest {
    return new PermissionRequest(
      opening.id,
      opening.sessionId,
      opening.userId,
      opening.projectPath,
      opening.toolUseId,
      opening.toolName,
      opening.input,
      opening.riskHint,
      opening.requestedAt,
      opening.expiresAt,
    );
  }

  /**
   * The answer the deadline gives: no, from nobody.
   *
   * A value rather than a method, so that the one place which settles a request stays the one
   * place — see `PermissionSettlement`. Silence never authorises, and this is the shape it takes.
   */
  static expiry(at: Date): PermissionAnswer {
    return {
      decision: 'deny',
      reason: null,
      scope: 'once',
      resolvedBy: null,
      resolvedFrom: null,
      auto: true,
      at,
    };
  }

  get expiresAt(): Date {
    return this.deadline;
  }

  /** How many times the deadline has been moved. */
  get extensionsUsed(): number {
    return this.extensions;
  }

  /** How it was settled, or `null` while it is still blocking the loop. */
  get resolution(): PermissionResolution | null {
    return this.settled;
  }

  /**
   * `expired` is a refusal with no author and no reason — which is precisely what the deadline
   * produces, and what nothing else may produce. A trail that could not tell "somebody said no"
   * from "nobody said anything" would have lost the distinction anybody reading it is after.
   */
  get status(): PermissionRequestStatus {
    const settled = this.settled;

    if (settled === null) {
      return 'pending';
    }

    return settled.auto && settled.decision === 'deny' && settled.reason === null
      ? 'expired'
      : 'resolved';
  }

  get isPending(): boolean {
    return this.settled === null;
  }

  /**
   * Settles the request, if it is not settled already.
   *
   * It returns the decision that **counts** rather than the one that was offered, so a caller
   * never has to ask again to find out who won — and never has to handle a `null` that the state
   * of the object rules out.
   *
   * @throws {PermissionReasonRequiredError} when a **person** refuses without saying why. The
   *   reason goes into the trail and back to Claude as a message, which is how the agent learns to
   *   propose something else rather than retry the same command.
   */
  resolve(answer: PermissionAnswer): PermissionSettling {
    const unexplained =
      answer.decision === 'deny' && (answer.reason === null || answer.reason.length === 0);

    if (unexplained && !answer.auto) {
      throw new PermissionReasonRequiredError(this.id);
    }

    const settled = this.settled;
    if (settled !== null) {
      return { won: false, resolution: settled };
    }

    this.settled = { ...answer };
    return { won: true, resolution: answer };
  }

  /**
   * Pushes the deadline out to `incrementMs` from now.
   *
   * **Idempotent, and the definition is the point.** The command means "give me `increment` more
   * time from now", so asking twice at the same moment is one act and not two: a request whose
   * deadline already reaches that far comes back unchanged, without spending an extension. That is
   * what lets the browser and the phone both press the button on the same countdown and produce
   * one extension between them, with neither having to know the other exists.
   *
   * @throws {PermissionRequestExpiredError} when the deadline already refused it. `410 Gone`, and
   *   the distinction is worth making: "you were too late" is a different thing to tell somebody
   *   than "that was already decided".
   * @throws {PermissionRequestNotFoundError} when somebody answered it. Extending something that
   *   is over is an error rather than a silent no-op: whoever asked needs to know they did not
   *   extend anything.
   * @throws {PermissionExtensionLimitReachedError} at the ceiling
   */
  extend(incrementMs: number, maxExtensions: number, now: Date): PermissionExtension {
    if (this.status === 'expired') {
      throw new PermissionRequestExpiredError(this.id);
    }

    if (this.settled !== null) {
      throw new PermissionRequestNotFoundError(this.id);
    }

    const target = now.getTime() + incrementMs;

    if (target <= this.deadline.getTime()) {
      return {
        expiresAt: this.deadline,
        remainingExtensions: maxExtensions - this.extensions,
        changed: false,
      };
    }

    if (this.extensions >= maxExtensions) {
      throw new PermissionExtensionLimitReachedError(this.id, maxExtensions);
    }

    this.extensions += 1;
    this.deadline = new Date(target);

    return {
      expiresAt: this.deadline,
      remainingExtensions: maxExtensions - this.extensions,
      changed: true,
    };
  }
}

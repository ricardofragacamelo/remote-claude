import type { PushMessage } from '@domain/notification';
import type { Clock } from '@domain/shared';
import type { CancelScheduled, Scheduler } from '@application/shared';
import type { PushDelivery, PushOutcome, PushSender } from './ports/push.port';

/**
 * How many times a message is tried, and how far apart.
 *
 * Three attempts — the first and two more — one second and then four apart, each jittered by a
 * fifth so the phones of one backend do not all come back to the provider on the same beat
 * ([D-09](../../../../docs/plans/05-hardening-operations/decisions.md)).
 */
export interface PushRetryPolicy {
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly factor: number;
  readonly jitterRatio: number;
}

export const PUSH_RETRY: PushRetryPolicy = {
  attempts: 3,
  baseDelayMs: 1_000,
  factor: 4,
  jitterRatio: 0.2,
};

/**
 * The wait before retry number `retry` (1 for the first one).
 *
 * The provider's `Retry-After` rules when it comes: it knows better than a formula how long it
 * needs. Otherwise exponential, jittered around the nominal value.
 *
 * @param random in `[0, 1)`; injected so the jitter is tested with numbers
 */
export function retryDelayMs(
  policy: PushRetryPolicy,
  retry: number,
  retryAfterMs: number | null,
  random: () => number,
): number {
  if (retryAfterMs !== null) {
    return Math.max(0, retryAfterMs);
  }

  const nominal = policy.baseDelayMs * policy.factor ** (retry - 1);
  const jitter = 1 + policy.jitterRatio * (2 * random() - 1);

  return Math.round(nominal * jitter);
}

/** What the dispatcher says when it gives up on a message, for the one `warn` that follows. */
export interface PushExhaustion {
  readonly requestId: string;
  readonly deviceId: string;
  readonly kind: string;
  readonly attempts: number;

  /** `attempts` — every attempt failed; `deadline` — the next one would land after the request. */
  readonly reason: 'attempts' | 'deadline';
}

/**
 * Where the dispatcher reports what happened after the caller stopped waiting.
 *
 * Callbacks rather than a logger, because `application/` has none and should not, and because a
 * retry runs on a timer that has nobody to return a promise to — a rejection there would be an
 * unhandled one.
 */
export interface PushRetryReporter {
  /** A message was given up on. Said once, with the number of attempts (S-48). */
  exhausted(exhaustion: PushExhaustion): void;

  /** A retry threw — erasing a refused token, say. The retries of that message end there. */
  failed(error: unknown, requestId: string): void;
}

/** What sending one message needs besides the message. */
export interface Dispatch {
  /** The group it belongs to — what {@link PushDispatcher.stop} cancels by. */
  readonly key: string;
  readonly requestId: string;
  readonly message: PushMessage;

  /** No attempt is made at or after this instant — a notification for a question already over. */
  readonly deadline: Date | null;

  /** What to do when the provider says the token is gone for good. */
  readonly onTokenRejected: () => Promise<void>;
}

/**
 * Sends a message, and tries again when the provider failed in a way that may pass — B-25.
 *
 * Only the **first** attempt is awaited. The caller is announcing a question that is already valid
 * on the web, beside a deadline that is already running, and a retry must never hold it (D-05 of
 * plan 02). The rest happens on the scheduler.
 *
 * Four rules, each from a way a retry goes wrong:
 *
 * - **only `failed` is tried again.** `tokenRejected` is permanent and erases the token; `rejected`
 *   is the provider refusing the message itself, and asking again does not change its mind;
 * - **never past the deadline.** A retry that would land after the request is over is not made;
 * - **stopping waits for the attempt in flight.** The withdrawal of a notification must reach the
 *   phone *after* the notification, or the phone ends with a card for a question that is over
 *   (S-51); so {@link stop} cancels what is scheduled and waits for what is already on the wire;
 * - **the same message, every time.** A retry is the very message that failed — same tag — so a
 *   first attempt that did reach the phone is replaced, not doubled (S-52).
 */
export class PushDispatcher {
  private readonly scheduled = new Map<string, Set<CancelScheduled>>();
  private readonly inFlight = new Map<string, Set<Promise<void>>>();
  private readonly stopped = new Set<string>();

  constructor(
    private readonly sender: PushSender,
    private readonly scheduler: Scheduler,
    private readonly clock: Clock,
    private readonly reporter: PushRetryReporter,
    private readonly policy: PushRetryPolicy = PUSH_RETRY,
    private readonly random: () => number = Math.random,
  ) {}

  /** @returns the answer to the first attempt; any retry happens after this resolves */
  async dispatch(dispatch: Dispatch): Promise<PushDelivery> {
    let first: PushDelivery = 'failed';

    await this.track(dispatch.key, async () => {
      first = await this.attempt(dispatch, 1);
    });

    return first;
  }

  /**
   * Stops every retry of `key`, and resolves once nothing of it is on the wire any more.
   *
   * Whatever was already sent may still arrive; nothing is sent after this resolves.
   */
  async stop(key: string): Promise<void> {
    this.stopped.add(key);

    try {
      await Promise.allSettled([...(this.inFlight.get(key) ?? [])]);

      for (const cancel of this.scheduled.get(key) ?? []) {
        cancel();
      }
      this.scheduled.delete(key);
    } finally {
      this.stopped.delete(key);
    }
  }

  /** How many retries are waiting. For a test, and for a diagnostic later. */
  get pending(): number {
    return [...this.scheduled.values()].reduce((total, group) => total + group.size, 0);
  }

  /** One attempt, and — when it failed in a way that may pass — the next one armed. */
  private async attempt(dispatch: Dispatch, number: number): Promise<PushDelivery> {
    const outcome = await this.sender.send(dispatch.message);

    if (outcome.delivery === 'tokenRejected') {
      await dispatch.onTokenRejected();
    } else if (outcome.delivery === 'failed') {
      this.retryLater(dispatch, number, outcome);
    }

    return outcome.delivery;
  }

  private retryLater(dispatch: Dispatch, failedAttempt: number, outcome: PushOutcome): void {
    if (this.stopped.has(dispatch.key)) {
      return;
    }

    if (failedAttempt >= this.policy.attempts) {
      this.exhausted(dispatch, failedAttempt, 'attempts');
      return;
    }

    const delayMs = retryDelayMs(this.policy, failedAttempt, outcome.retryAfterMs, this.random);
    const at = this.clock.now().getTime() + delayMs;

    if (dispatch.deadline !== null && at >= dispatch.deadline.getTime()) {
      this.exhausted(dispatch, failedAttempt, 'deadline');
      return;
    }

    const group = this.scheduled.get(dispatch.key) ?? new Set<CancelScheduled>();
    this.scheduled.set(dispatch.key, group);

    const cancel = this.scheduler.after(delayMs, () => {
      group.delete(cancel);
      if (group.size === 0) {
        this.scheduled.delete(dispatch.key);
      }

      this.track(dispatch.key, async () => {
        await this.attempt(dispatch, failedAttempt + 1);
      }).catch((error: unknown) => {
        this.reporter.failed(error, dispatch.requestId);
      });
    });

    group.add(cancel);
  }

  private exhausted(dispatch: Dispatch, attempts: number, reason: PushExhaustion['reason']): void {
    this.reporter.exhausted({
      requestId: dispatch.requestId,
      deviceId: dispatch.message.target.deviceId,
      kind: dispatch.message.kind,
      attempts,
      reason,
    });
  }

  /** Runs `work` as something of `key` on the wire, so {@link stop} can wait for it. */
  private async track(key: string, work: () => Promise<void>): Promise<void> {
    const running = work();
    const group = this.inFlight.get(key) ?? new Set<Promise<void>>();
    this.inFlight.set(key, group);
    group.add(running);

    try {
      await running;
    } finally {
      group.delete(running);
      if (group.size === 0) {
        this.inFlight.delete(key);
      }
    }
  }
}

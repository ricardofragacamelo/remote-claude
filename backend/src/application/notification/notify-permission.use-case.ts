import { PushMessage } from '@domain/notification';
import type { PermissionReference, PushTarget } from '@domain/notification';
import type { Device, UserId } from '@domain/auth';
import type { NotificationRegistry } from './notification-registry';
import type { PushAudience } from './ports/push-audience.port';
import type { PushTokenRegistry } from './ports/push-token-registry.port';
import type { PushDispatcher } from './push-dispatcher';

/** What announcing one question needs to know. Nothing about the tool's input is in here. */
export interface NotifyPermissionCommand {
  readonly userId: UserId;
  readonly sessionId: string;
  readonly requestId: string;
  readonly expiresAt: Date;

  /** The tool's **name**. Never its input — a push goes through somebody else's server (S-19). */
  readonly toolName: string;
}

/** What the use case did, so the caller can log it and a test can assert on it. */
export type NotifyOutcome =
  'announced' | 'somebodyIsWatching' | 'nobodyToTell' | 'alreadyAnnounced';

/**
 * Telling the phones about a question nobody on a screen has seen.
 *
 * Three refusals before anything is sent, and each one is a different kind of "no":
 *
 * - **somebody is watching that session.** They have already been asked. A notification on top of
 *   the card they are looking at is the noise that teaches people to dismiss notifications;
 * - **this request was already announced.** The SDK redelivers, the deadline is extended, a
 *   reconnect replays — and none of those is a second question (S-24);
 * - **there is nobody to tell.** No approved device, or none with a token. That is not a failure:
 *   the request is still on the web, and the deadline still decides in the silence.
 *
 * When it does send, it sends to **every** approved device (D-04) and **one notification per
 * request** (D-15) — which is what keeps the deep link pointing at one card, and what lets the
 * cancellation name exactly what it cancels.
 *
 * Nothing here can fail loudly. The provider is a best effort beside a deadline that is not: a
 * push that did not go out costs a person the chance to answer from away, and the price is
 * recorded in [D-05](../../../../docs/plans/02-mobile-approval/decisions.md#d-05--quando-o-push-não-sai).
 * What changed with plan 05 is that a failure that may pass is **tried again** — a bounded number
 * of times, never past the request's deadline, and never holding it (B-25, D-09). The withdrawal
 * waits for an announcement still on the wire, so it can never be overtaken by it (S-51).
 */
export class NotifyPermissionUseCase {
  constructor(
    private readonly audience: PushAudience,
    private readonly dispatcher: PushDispatcher,
    private readonly tokens: PushTokenRegistry,
    private readonly registry: NotificationRegistry,
    private readonly render: (target: PushTarget, command: NotifyPermissionCommand) => PushMessage,
  ) {}

  async execute(command: NotifyPermissionCommand): Promise<NotifyOutcome> {
    if (this.audience.isWatching(command.userId, command.sessionId)) {
      return 'somebodyIsWatching';
    }

    if (this.registry.has(command.requestId)) {
      return 'alreadyAnnounced';
    }

    const targets = reachable(await this.audience.approvedDevices(command.userId));
    if (targets.length === 0) {
      return 'nobodyToTell';
    }

    // Recorded **before** the provider is reached: two deliveries of the same call arriving
    // together would otherwise both find nothing recorded and both send.
    this.registry.remember(command.requestId, targets);

    await Promise.all(
      targets.map((target) =>
        this.dispatcher.dispatch({
          key: announcementOf(command.requestId),
          requestId: command.requestId,
          message: this.render(target, command),
          // A retry that would land after the question is over is not made.
          deadline: command.expiresAt,
          onTokenRejected: () => this.forget(command.userId, target),
        }),
      ),
    );

    return 'announced';
  }

  /**
   * The question is over, however it ended — so the notification goes.
   *
   * Sent to exactly the devices that were told, by the tag of exactly that request. A provider
   * cannot withdraw a notification, so the withdrawal is a silent message of its own.
   *
   * @returns how many devices were told to take it down. Zero is the ordinary case: somebody was
   *   watching, so nothing was ever sent.
   */
  async cancel(userId: UserId, reference: PermissionReference): Promise<number> {
    const targets = this.registry.take(reference.requestId);

    // First the announcement stops: a retry still waiting is cancelled, and one already on the
    // wire is waited for. Only then does the withdrawal go — sent before, it could be overtaken by
    // the very notification it withdraws (S-50, S-51).
    await this.dispatcher.stop(announcementOf(reference.requestId));

    await Promise.all(
      targets.map((target) =>
        this.dispatcher.dispatch({
          key: withdrawalOf(reference.requestId),
          requestId: reference.requestId,
          message: PushMessage.permissionResolved(target, reference),
          // The withdrawal has no deadline of its own: the question is already over, and a card
          // left standing is exactly what it exists to take down. The attempts bound it.
          deadline: null,
          onTokenRejected: () => this.forget(userId, target),
        }),
      ),
    );

    return targets.length;
  }

  /**
   * Erases a token the provider refused, keeping the device approved.
   *
   * The device is looked up again rather than carried along, because the token registry writes an
   * entity and the target is only what the provider needed. A device that has gone in the
   * meantime is simply not there any more, and that is not a failure either.
   */
  private async forget(userId: UserId, target: PushTarget): Promise<void> {
    const device = (await this.audience.approvedDevices(userId)).find(
      (candidate) => candidate.id === target.deviceId,
    );

    if (device !== undefined) {
      await this.tokens.forget(device);
    }
  }
}

/** The dispatch group of a request's announcement — what its withdrawal stops. */
function announcementOf(requestId: string): string {
  return `${requestId}:announce`;
}

/** The dispatch group of a request's withdrawal. Never stopped: it is the last word. */
function withdrawalOf(requestId: string): string {
  return `${requestId}:withdraw`;
}

/** The approved devices that can actually be reached. A device with no token is not one. */
function reachable(devices: readonly Device[]): PushTarget[] {
  return devices.flatMap((device) => {
    const token = device.pushToken;

    return token === null
      ? []
      : [{ deviceId: device.id, token, locale: device.locale } satisfies PushTarget];
  });
}

import type { DeviceLocale } from '@domain/auth';
import type { PushKind } from '../value-objects/push-kind.value-object';

/**
 * What a permission push is allowed to say about the request it is about.
 *
 * Three fields, and the list is closed on purpose. This is what lets the tap open the right card
 * — the session, the request, and how long it is still worth opening — and it is **all** that
 * crosses. See {@link PushMessage}.
 */
export interface PermissionReference {
  readonly sessionId: string;
  readonly requestId: string;

  /** ISO-8601. The app shows the real state rather than a card that expired on the way (S-57). */
  readonly expiresAt: string;
}

/** Who a message is going to, as far as this domain is concerned. */
export interface PushTarget {
  readonly deviceId: string;

  /** The provider's token for that installation. Never logged, not even truncated. */
  readonly token: string;

  /** The language the payload is rendered in. It is the device's, not the connection's. */
  readonly locale: DeviceLocale;
}

/** The interpolation values the title and the body take. Never a path, never an output. */
export type PushParams = Readonly<Record<string, string>>;

/**
 * What a request asks of the person: leave to run a tool, or an answer to a question of Claude
 * (plan 24, D-22). It chooses the words; the tap opens the same screen either way.
 */
export type PushSubject = 'permission' | 'question';

/**
 * One notification, for one device.
 *
 * **It never carries the content of a file or the output of a command.** Not as a matter of
 * bytes: a push travels through somebody else's server, and this is the one message of the
 * product that a third party sees. The rule is enforced by construction rather than by review —
 * the only way to build one is through the factories below, which take a
 * {@link PermissionReference} and a closed set of parameters, so there is no field a caller could
 * put an output into (S-19, S-20). The one message that is not about a request — the device was
 * approved — carries nothing at all but the device it is going to.
 *
 * The **tag** is the `requestId`, and that is what makes one notification per request work: the
 * operating system replaces a notification with the same tag rather than stacking a second, and
 * the cancellation that follows names the same tag
 * ([D-15](../../../../docs/plans/02-mobile-approval/decisions.md#d-15--três-pedidos-na-bandeja)).
 * The approval's tag is the device's, apart from every request's.
 */
export class PushMessage {
  private constructor(
    readonly kind: PushKind,
    readonly target: PushTarget,
    /** The request it is about, or `null` for a message about the device itself. */
    readonly reference: PermissionReference | null,
    readonly params: PushParams,
    readonly subject: PushSubject = 'permission',
  ) {}

  /**
   * Somebody has to decide something.
   *
   * @param params what the sentence interpolates — the tool's **name** and nothing from its input
   */
  static permissionRequested(
    target: PushTarget,
    reference: PermissionReference,
    params: PushParams,
  ): PushMessage {
    return new PushMessage('permissionRequested', target, reference, params);
  }

  /**
   * Claude asked the person something.
   *
   * It carries **nothing** of the question — not its text, not an option: a push passes through
   * somebody else's server, and the question is Claude's words about somebody's work
   * ([workflow §14](../../../../docs/discovery/02-workflow-de-sessoes.md)). The tap opens the same card.
   */
  static questionAsked(target: PushTarget, reference: PermissionReference): PushMessage {
    return new PushMessage('permissionRequested', target, reference, {}, 'question');
  }

  /**
   * The question is over, however it ended.
   *
   * Silent and wordless: it exists so the app can take down what it already showed. A provider
   * cannot withdraw a notification, so the withdrawal has to be a message of its own.
   */
  static permissionResolved(target: PushTarget, reference: PermissionReference): PushMessage {
    return new PushMessage('permissionResolved', target, reference, {});
  }

  /**
   * The phone it is going to may decide from now on (plan 17, F3).
   *
   * Seen, not silent, and wordless beyond the fact: the sentence is the device's language, and
   * nothing else crosses.
   */
  static deviceApproved(target: PushTarget): PushMessage {
    return new PushMessage('deviceApproved', target, null, {});
  }

  /** What the operating system replaces, and what the cancellation names. */
  get tag(): string {
    return this.reference === null ? `device:${this.target.deviceId}` : this.reference.requestId;
  }

  /** Whether this message is meant to be seen. The cancellation is not. */
  get isSilent(): boolean {
    return this.kind === 'permissionResolved';
  }
}

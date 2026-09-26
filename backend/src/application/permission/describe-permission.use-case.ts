import {
  PermissionNotOwnedError,
  PermissionRequestExpiredError,
  PermissionRequestNotFoundError,
} from '@domain/permission';
import type { UserId } from '@domain/auth';
import { requestedPayload, resolvedPayload } from './permission-payloads';
import type { ResolvedPermissionPayload } from './permission-payloads';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionSettings } from './permission-settings';

/** Which request somebody is asking about, and who is asking. */
export interface DescribePermissionQuery {
  readonly requestId: string;

  /**
   * The session the caller believes the request belongs to, as it arrived.
   *
   * A string and not a `SessionId`: an id that is not a ULID is a session no request belongs to,
   * and the answer to "is this request of that session?" is the same `404` either way. Parsing it
   * first would only give a malformed link a different status from a wrong one.
   */
  readonly sessionId: string;

  readonly userId: UserId;
}

/** Where a request stands, when the answer is not a refusal. */
export type PermissionState =
  | {
      readonly status: 'pending';

      /** Exactly the `permission.requested` payload — the card renders from this and nothing else. */
      readonly request: Readonly<Record<string, unknown>>;

      /** What stops a card offering an extension that no longer exists. */
      readonly remainingExtensions: number;
    }
  | ({ readonly status: 'resolved' } & ResolvedPermissionPayload);

/**
 * The real state of one request, asked for rather than waited for.
 *
 * A push can arrive late, and the request it announces may have been answered on another screen
 * or refused by the deadline in the meantime. Re-attaching the socket republishes what is still
 * pending, but with no marker for "that was all": a card missing after *n* milliseconds is a guess,
 * not an answer. This is the answer — read from the same registry the attach replays from
 * ([D-22](../../../../docs/plans/02-mobile-approval/decisions.md#d-22--revalidar-é-perguntar-não-esperar)).
 *
 * It **reads** and nothing more: answering is still the socket's, because the `correlationId` a
 * response needs comes from the frame the attach delivers.
 *
 * The refusals come in one order, and the order is what keeps them honest:
 *
 * 1. **unknown id** — `PERMISSION_REQUEST_NOT_FOUND`, 404;
 * 2. **somebody else's** — `PERMISSION_NOT_OWNED`, 403. Before the session check, so the answer a
 *    stranger gets does not depend on which session they guessed;
 * 3. **not of that session** — `PERMISSION_REQUEST_NOT_FOUND`, 404. The caller owns it, the link
 *    does not point at it, and a link that points at nothing is a record that is not there;
 * 4. **the deadline refused it** — `PERMISSION_REQUEST_EXPIRED`, 410. "You were too late" is a
 *    different thing to tell somebody than "that was decided", so it is not folded into resolved.
 */
export class DescribePermissionUseCase {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly settings: PermissionSettings,
  ) {}

  /**
   * @throws {PermissionRequestNotFoundError} unknown, or not of that session
   * @throws {PermissionNotOwnedError} another user's request
   * @throws {PermissionRequestExpiredError} the deadline refused it
   */
  execute(query: DescribePermissionQuery): PermissionState {
    const request = this.registry.find(query.requestId);

    if (request === null) {
      throw new PermissionRequestNotFoundError(query.requestId);
    }

    if (!request.userId.equals(query.userId)) {
      throw new PermissionNotOwnedError(query.requestId);
    }

    if (request.sessionId.value !== query.sessionId) {
      throw new PermissionRequestNotFoundError(query.requestId);
    }

    const resolution = request.resolution;

    if (resolution === null) {
      return {
        status: 'pending',
        request: requestedPayload(request, this.settings.ruleDefaultLifetimeMs),
        remainingExtensions: this.settings.maxExtensions - request.extensionsUsed,
      };
    }

    if (request.status === 'expired') {
      throw new PermissionRequestExpiredError(query.requestId);
    }

    return { status: 'resolved', ...resolvedPayload(request.id, resolution) };
  }
}

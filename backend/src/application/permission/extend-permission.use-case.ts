import type { PermissionExtension } from '@domain/permission';
import type { Clock } from '@domain/shared';
import { answerableRequest } from './answerable-request';
import type { Answerer } from './answerable-request';
import type { PermissionDeadlines } from './permission-deadlines';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionSettings } from './permission-settings';
import type { PermissionBroadcaster } from './ports/permission-broadcaster.port';
import type { PermissionRequestRepository } from './ports/permission-request.repository';

/** One request to be given more time. The payload carries no number — the installation owns it. */
export type ExtendPermissionCommand = Answerer;

/**
 * Moving the one protection there is.
 *
 * Our timeout is the only thing between somebody who walked away and a session that hangs for
 * ever — the CLI imposes none — so this use case is deliberately the strictest in the module:
 *
 * - **the client sends no number.** Increment and ceiling come from configuration, because a
 *   client that could choose them could switch the protection off;
 * - **the ceiling is hard.** Reaching it is an error the UI has to show, not a silent no-op that
 *   leaves a countdown looking extendable when it is not;
 * - **extending something already over is an error.** Whoever pressed the button needs to know
 *   they did not extend anything (`PERMISSION_REQUEST_NOT_FOUND`);
 * - **it is idempotent by request.** Browser and phone may press it on the same countdown; the
 *   entity settles what that means, and it costs one extension between them.
 */
export class ExtendPermissionUseCase {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly requests: PermissionRequestRepository,
    private readonly deadlines: PermissionDeadlines,
    private readonly broadcaster: PermissionBroadcaster,
    private readonly clock: Clock,
    private readonly settings: PermissionSettings,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRequestNotFoundError} unknown, or already over
   * @throws {import('@domain/permission').PermissionNotOwnedError} not watching that session
   * @throws {import('@domain/permission').PermissionExtensionLimitReachedError} at the ceiling
   */
  async execute(command: ExtendPermissionCommand): Promise<PermissionExtension> {
    const request = answerableRequest(this.registry, command);

    const extension = request.extend(
      this.settings.extensionMs,
      this.settings.maxExtensions,
      this.clock.now(),
    );

    if (!extension.changed) {
      // The deadline already reached that far, so nothing moved and nothing was spent. There is
      // nothing to record and nothing to announce: the countdown on every screen is already right.
      return extension;
    }

    // Recorded before it is announced, so the history can say how long a question was held open
    // even for a process that dies before anybody answers it.
    await this.requests.update(request);
    this.deadlines.arm(request);
    this.broadcaster.publish(request.sessionId, {
      type: 'permission.extended',
      payload: {
        requestId: request.id,
        expiresAt: extension.expiresAt.toISOString(),
        remainingExtensions: extension.remainingExtensions,
      },
    });

    return extension;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { NotifyPermissionUseCase } from '@application/notification';
import type { PermissionRequestedEvent, PermissionResolvedEvent } from '@application/permission';
import type { PermissionRequest } from '@domain/permission';
import {
  PERMISSION_REQUESTED,
  PERMISSION_RESOLVED,
} from '@adapter/outbound/permission/emitter-permission.events';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * What both consumers do with a request, and what they say when it does not work.
 *
 * The two differ in one line each — one announces, the other withdraws — and everything around
 * that line is identical: the same fields in the log, the same refusal to wait, the same refusal
 * to let a failure travel. Written twice, the pair drifts, and the half that drifts is the error
 * path nobody reads until they need it.
 *
 * **Neither waits.** The producer of `permission.requested` is the call holding the agent loop,
 * and the producer of `permission.resolved` is the one releasing it. A provider may not be in
 * either path.
 */
abstract class PushConsumer {
  constructor(
    @Inject(NotifyPermissionUseCase) protected readonly notify: NotifyPermissionUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Runs the half that differs, and lets nothing out of it.
   *
   * A failure is logged and goes no further: the request is still valid in the browser and the
   * deadline still decides in the silence — what a failed push costs is said out loud in
   * [D-05](../../../../../docs/plans/02-mobile-approval/decisions.md#d-05--quando-o-push-não-sai).
   */
  protected run(request: PermissionRequest, act: () => Promise<unknown>, failed: string): void {
    const line = {
      op: 'push.send',
      layer: 'adapter',
      module: 'notification',
      sessionId: request.sessionId.value,
      requestId: request.id,
    };

    void act()
      .then((outcome) => {
        this.logger.debug({ ...line, outcome }, 'the devices of this user were dealt with');
      })
      .catch((error: unknown) => {
        this.logger.warn({ ...line, err: error }, failed);
      });
  }
}

/** The consumer that tells the phones about a question nobody on a screen has seen. */
@Injectable()
export class NotifyOnPermissionRequested extends PushConsumer {
  @OnEvent(PERMISSION_REQUESTED)
  handle(event: PermissionRequestedEvent): void {
    const { request } = event;

    this.run(
      request,
      () =>
        this.notify.execute({
          userId: request.userId,
          sessionId: request.sessionId.value,
          requestId: request.id,
          expiresAt: request.expiresAt,
          // The **name** of the tool, and nothing from its input: a push passes through somebody
          // else's server (S-19).
          toolName: request.toolName,
        }),
      'the question could not be announced to the devices of this user',
    );
  }
}

/**
 * The consumer that withdraws a notification for a question that is over.
 *
 * However it ended — answered from anywhere, or refused by the deadline. A notification for an
 * action that no longer exists is the fastest way to teach somebody to ignore this app's
 * notifications (S-21, S-22).
 */
@Injectable()
export class CancelOnPermissionResolved extends PushConsumer {
  @OnEvent(PERMISSION_RESOLVED)
  handle(event: PermissionResolvedEvent): void {
    const { request } = event;

    this.run(
      request,
      () =>
        this.notify.cancel(request.userId, {
          sessionId: request.sessionId.value,
          requestId: request.id,
          expiresAt: request.expiresAt.toISOString(),
        }),
      'the notification for a question that is over could not be withdrawn',
    );
  }
}

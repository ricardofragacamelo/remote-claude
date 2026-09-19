import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { PermissionEvents, PermissionResolvedEvent } from '@application/permission';
import { LOGGER, type Logger } from '@shared/logging/logger';

/** The name on the bus. `<module>.<fact in the past>`, exactly like the event on the wire. */
export const PERMISSION_RESOLVED = 'permission.resolved';

/**
 * The internal bus, over `EventEmitter2`.
 *
 * `permission.resolved` has three consumers and none of them may be called directly: `audit`
 * writes the decision, the session runtime releases the agent loop, and — from the mobile plan on
 * — `notification` cancels a push that is no longer needed. Calling all three would make
 * `permission` depend on all three, and the fourth would mean editing it again
 * (docs/architecture/backend/03-modules.md#comunicação-assíncrona).
 *
 * **Publication never throws.** The most important consumer is the one that lets the agent loop
 * go, and a listener that failed must not be able to hold a session open. `emit` is synchronous
 * for synchronous listeners, so the loop is released within this call.
 */
@Injectable()
export class EmitterPermissionEvents implements PermissionEvents {
  constructor(
    @Inject(EventEmitter2) private readonly emitter: EventEmitter2,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  resolved(event: PermissionResolvedEvent): void {
    this.logger.debug(
      {
        op: 'permission.resolve',
        layer: 'adapter',
        sessionId: event.request.sessionId.value,
        requestId: event.request.id,
        decision: event.request.resolution?.decision,
        auto: event.request.resolution?.auto,
      },
      'publishing permission.resolved on the internal bus',
    );

    try {
      this.emitter.emit(PERMISSION_RESOLVED, event);
    } catch (error) {
      // Logged and swallowed, deliberately. A consumer that threw has a problem of its own; the
      // agent loop waiting on this resolution has not, and it must not inherit one.
      this.logger.error(
        {
          op: 'permission.resolve',
          layer: 'adapter',
          sessionId: event.request.sessionId.value,
          requestId: event.request.id,
          err: error,
        },
        'a consumer of permission.resolved failed',
      );
    }
  }
}

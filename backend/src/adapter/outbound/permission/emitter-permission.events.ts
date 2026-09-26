import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type {
  PermissionEvents,
  PermissionRequestedEvent,
  PermissionResolvedEvent,
} from '@application/permission';
import { LOGGER, type Logger } from '@shared/logging/logger';

/** The names on the bus. `<module>.<fact in the past>`, exactly like the events on the wire. */
export const PERMISSION_REQUESTED = 'permission.requested';
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

  requested(event: PermissionRequestedEvent): void {
    this.logger.debug(
      {
        op: 'permission.request',
        layer: 'adapter',
        sessionId: event.request.sessionId.value,
        requestId: event.request.id,
      },
      'publishing permission.requested on the internal bus',
    );

    this.publish(PERMISSION_REQUESTED, event.request.sessionId.value, event.request.id, () => {
      this.emitter.emit(PERMISSION_REQUESTED, event);
    });
  }

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

    this.publish(PERMISSION_RESOLVED, event.request.sessionId.value, event.request.id, () => {
      this.emitter.emit(PERMISSION_RESOLVED, event);
    });
  }

  /**
   * Emits, and swallows whatever a consumer threw.
   *
   * Logged and swallowed, deliberately, and written once for both facts. A consumer that threw
   * has a problem of its own; the agent loop waiting on the resolution has not, and it must not
   * inherit one. The same holds for the question: a notification that failed to go out must not
   * stop the card that already did.
   */
  private publish(name: string, sessionId: string, requestId: string, emit: () => void): void {
    try {
      emit();
    } catch (error) {
      this.logger.error(
        { op: 'permission.resolve', layer: 'adapter', sessionId, requestId, err: error },
        `a consumer of ${name} failed`,
      );
    }
  }
}

import { Inject, Injectable } from '@nestjs/common';

import type { SessionBroadcaster, SessionEvent } from '@application/session';
import type { SessionId } from '@domain/session';
import { SessionHub } from '@infra/websocket/session-hub';
import { currentTraceId } from '@shared/logging/trace-context';

/**
 * The broadcaster, over the WebSocket hub.
 *
 * A thin adapter on purpose: what it exists for is the direction of the dependency. The hub lives
 * in `infrastructure/websocket/`, the use cases live in `application/`, and a use case that
 * imported the hub would have the arrow pointing outward. Here the arrow points in, and `seq`, the
 * ring buffer and the sockets stay on this side of it.
 */
@Injectable()
export class HubSessionBroadcaster implements SessionBroadcaster {
  constructor(@Inject(SessionHub) private readonly hub: SessionHub) {}

  publish(sessionId: SessionId, event: SessionEvent): void {
    this.hub.publish(sessionId.value, { type: event.type, payload: event.payload });
  }

  publishError(sessionId: SessionId, error: unknown): void {
    this.hub.publishError(sessionId.value, error, currentTraceId() ?? 'unknown');
  }
}

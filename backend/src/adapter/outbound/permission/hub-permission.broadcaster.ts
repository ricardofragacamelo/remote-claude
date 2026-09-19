import { Inject, Injectable } from '@nestjs/common';

import type { PermissionBroadcaster, PermissionFrame } from '@application/permission';
import type { SessionId } from '@domain/session';
import { SessionHub } from '@infra/websocket/session-hub';

/**
 * The permission broadcaster, over the WebSocket hub.
 *
 * A thin adapter, and what it exists for is the direction of the dependency: the hub lives in
 * `infrastructure/websocket/`, the use cases live in `application/`, and a use case that imported
 * the hub would have the arrow pointing outward.
 *
 * The two methods are two different things on the wire. A **question** is a `request` frame: it is
 * not numbered and not kept, because a question is not part of the history of the conversation and
 * replaying an answered one would put a dead card back on screen. A **fact** is an ordinary event,
 * numbered and replayed like any other.
 */
@Injectable()
export class HubPermissionBroadcaster implements PermissionBroadcaster {
  constructor(@Inject(SessionHub) private readonly hub: SessionHub) {}

  request(sessionId: SessionId, frame: PermissionFrame): void {
    this.hub.request(sessionId.value, { type: frame.type, payload: frame.payload });
  }

  publish(sessionId: SessionId, frame: PermissionFrame): void {
    this.hub.publish(sessionId.value, { type: frame.type, payload: frame.payload });
  }
}

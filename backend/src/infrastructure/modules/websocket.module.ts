import { Module } from '@nestjs/common';

import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { ConnectionRegistry } from '../websocket/connection-registry';
import { EventBuffer } from '../websocket/event-buffer';
import { FrameBuilder } from '../websocket/frame-builder';
import { SessionHub } from '../websocket/session-hub';

/**
 * The transport pieces, without the gateway.
 *
 * Split from `GatewayModule` so a domain module can depend on the hub — which it must, to publish
 * — without the gateway having to depend on it back. A cycle between the two is a module that
 * cannot be built in isolation, and one that cannot be tested in isolation either.
 */
@Module({
  providers: [
    ConnectionRegistry,
    { provide: EventBuffer, useFactory: () => new EventBuffer() },
    {
      provide: FrameBuilder,
      inject: [CLOCK, ID_GENERATOR],
      useFactory: (clock: Clock, ids: IdGenerator) => new FrameBuilder(clock, ids),
    },
    SessionHub,
  ],
  exports: [ConnectionRegistry, EventBuffer, FrameBuilder, SessionHub],
})
export class WebsocketModule {}

import { Module } from '@nestjs/common';

import { SESSION_BROADCASTER, SessionRegistry } from '@application/session';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { HubSessionBroadcaster } from '@adapter/outbound/session/hub-session.broadcaster';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import {
  MACHINE_MEMORY,
  machineMemoryBytes,
  sessionRegistryFor,
} from '../lifecycle/session-capacity';
import { WebsocketModule } from './websocket.module';

/**
 * The registry of live sessions, and the way to publish to one — and nothing else.
 *
 * A module of its own for the reason `SessionOriginModule` is one: two modules need it and one of
 * them needs the other. `session` drives what the registry holds, and to continue a conversation
 * asks `transcript` about it; `transcript` asks the registry which conversations are live for the
 * caller, to say so in the history (plan 08, B-08). `mcp` is the same shape again (plan 13, B-23):
 * disabling or removing a server reaches every live session that has it, and `session` already
 * imports `mcp` (B-21, to compose a session's servers) — with either piece inside `session`, the two
 * would import each other, the cycle the boundaries forbid
 * (docs/architecture/backend/03-modules.md#fronteiras). `SESSION_BROADCASTER` joined this module
 * for the same reason `SessionRegistry` is here: `HubSessionBroadcaster` needs only `SessionHub`
 * (`WebsocketModule`), nothing of `session` itself.
 *
 * It is still `session`'s: both classes live under `application/session`, and `session` is the only
 * writer of either. This is wiring, not a new owner.
 */
@Module({
  imports: [WebsocketModule],
  providers: [
    // Read once, at boot: the capacity is derived from it (D-01), and a suite that needs a small
    // machine replaces this one number rather than the whole registry.
    { provide: MACHINE_MEMORY, useFactory: () => machineMemoryBytes() },
    {
      provide: SessionRegistry,
      inject: [APP_CONFIG, MACHINE_MEMORY, CLOCK, LOGGER],
      useFactory: (config: AppConfig, memoryBytes: number, clock: Clock, logger: Logger) =>
        sessionRegistryFor(config, memoryBytes, clock, logger),
    },
    { provide: SESSION_BROADCASTER, useClass: HubSessionBroadcaster },
  ],
  exports: [SessionRegistry, SESSION_BROADCASTER],
})
export class SessionRegistryModule {}

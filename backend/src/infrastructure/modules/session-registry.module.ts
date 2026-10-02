import { Module } from '@nestjs/common';

import { SessionRegistry } from '@application/session';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import {
  MACHINE_MEMORY,
  machineMemoryBytes,
  sessionRegistryFor,
} from '../lifecycle/session-capacity';

/**
 * The registry of live sessions — and nothing else.
 *
 * A module of its own for the reason `SessionOriginModule` is one: two modules need it and one of
 * them needs the other. `session` drives what the registry holds, and to continue a conversation
 * asks `transcript` about it; `transcript` asks the registry which conversations are live for the
 * caller, to say so in the history (plan 08, B-08). With the registry inside `session`, the two
 * would import each other — the cycle the boundaries forbid
 * (docs/architecture/backend/03-modules.md#fronteiras).
 *
 * It is still `session`'s: the class is in `application/session`, and `session` is the only writer.
 * This is wiring, not a new owner.
 */
@Module({
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
  ],
  exports: [SessionRegistry],
})
export class SessionRegistryModule {}

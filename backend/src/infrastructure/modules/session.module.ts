import { Module } from '@nestjs/common';

import { AttachSessionUseCase, PingSessionUseCase, SESSION_REPOSITORY } from '@application/session';
import type { SessionRepository } from '@application/session';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { SessionAttachHandler } from '@adapter/inbound/ws/session/session-attach.gateway-handler';
import { SessionPingHandler } from '@adapter/inbound/ws/session/session.gateway-handler';
import { DrizzleSessionRepository } from '@adapter/outbound/persistence/session/drizzle-session.repository';
/** The `session` module: the vertical slice of the bootstrap, across all four layers. */
@Module({
  providers: [
    { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
    {
      provide: PingSessionUseCase,
      inject: [SESSION_REPOSITORY, CLOCK, ID_GENERATOR],
      useFactory: (sessions: SessionRepository, clock: Clock, ids: IdGenerator) =>
        new PingSessionUseCase(sessions, clock, ids),
    },
    {
      provide: AttachSessionUseCase,
      inject: [SESSION_REPOSITORY],
      useFactory: (sessions: SessionRepository) => new AttachSessionUseCase(sessions),
    },
    SessionPingHandler,
    SessionAttachHandler,
  ],
  exports: [SessionPingHandler, SessionAttachHandler],
})
export class SessionModule {}

import { Module } from '@nestjs/common';

import { DIAG_SESSION_REPOSITORY, PingDiagUseCase } from '@application/diag';
import type { DiagSessionRepository } from '@application/diag';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { ContractCommandHandler } from '@adapter/inbound/ws/contract-command.gateway-handler';
import { DIAG_HANDLERS, diagSchemas } from '@adapter/inbound/ws/diag/diag-commands';
import { DiagSessionOwnership } from '@adapter/outbound/diag/diag-session.ownership';
import { DrizzleDiagSessionRepository } from '@adapter/outbound/persistence/diag/drizzle-diag-session.repository';

/**
 * The `diag` module: the gateway round trip that needs no Claude.
 *
 * It was the vertical slice of the bootstrap and it stays, because it is the cheapest smoke test
 * of the whole rail. It is a module of its own rather than part of `session` so that nothing here
 * can be mistaken for a session of Claude — D-01 of the live-session plan renamed the pair, and
 * this is the rest of that move.
 */
@Module({
  providers: [
    { provide: DIAG_SESSION_REPOSITORY, useClass: DrizzleDiagSessionRepository },
    DiagSessionOwnership,
    {
      provide: PingDiagUseCase,
      inject: [DIAG_SESSION_REPOSITORY, CLOCK, ID_GENERATOR],
      useFactory: (sessions: DiagSessionRepository, clock: Clock, ids: IdGenerator) =>
        new PingDiagUseCase(sessions, clock, ids),
    },
    {
      provide: DIAG_HANDLERS.ping,
      inject: [PingDiagUseCase],
      useFactory: (ping: PingDiagUseCase) =>
        new ContractCommandHandler('diag.ping', diagSchemas.ping, async (command, context) => {
          const pong = await ping.execute({
            sessionId: command.sessionId ?? null,
            nonce: command.nonce,
            userId: context.userId,
          });

          // Whoever pings a session is watching it: without this the caller would not receive the
          // very event it asked for, because fan-out only reaches attached connections.
          const sessionId = pong.sessionId.value;
          context.attach(sessionId);

          return {
            sessionId,
            type: 'diag.pong',
            payload: {
              sessionId,
              pingedAt: pong.pingedAt.toISOString(),
              pingCount: pong.pingCount,
              nonce: pong.nonce,
            },
          };
        }),
    },
  ],
  exports: [DIAG_HANDLERS.ping, DiagSessionOwnership],
})
export class DiagModule {}

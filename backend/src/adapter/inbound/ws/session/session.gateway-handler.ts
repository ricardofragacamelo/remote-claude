import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { PingSessionUseCase } from '@application/session';
import { payloadOf } from '../frame-payload';
import type { WsCommandContext, WsCommandHandler, WsCommandOutcome } from '../ws-command';

const pingSchema = z.object({
  sessionId: z.string().optional(),
  nonce: z.string().min(1),
});

/**
 * `session.ping` → `session.pong`.
 *
 * The whole rail in one command: the frame is validated here, the use case orchestrates, the
 * entity owns the rule, the repository writes, and the hub numbers the event. The ack says the
 * command was **accepted**; the result arrives as an event, like every other result does.
 */
@Injectable()
export class SessionPingHandler implements WsCommandHandler {
  readonly type = 'session.ping';

  constructor(@Inject(PingSessionUseCase) private readonly pingSession: PingSessionUseCase) {}

  async handle(context: WsCommandContext): Promise<WsCommandOutcome> {
    const command = payloadOf(context.frame, pingSchema);

    const pong = await this.pingSession.execute({
      sessionId: command.sessionId ?? null,
      nonce: command.nonce,
      userId: context.userId,
    });

    // Whoever pings a session is watching it: without this the caller would not receive the very
    // event it asked for, because fan-out only reaches connections attached to the session.
    const sessionId = pong.sessionId.value;
    context.attach(sessionId);

    return {
      ack: { type: 'command.accepted', payload: { command: this.type } },
      then: [],
      publish: () => {
        context.publish(sessionId, {
          type: 'session.pong',
          payload: {
            sessionId,
            pingedAt: pong.pingedAt.toISOString(),
            pingCount: pong.pingCount,
            nonce: pong.nonce,
          },
          correlationId: context.frame.id,
          ...(context.frame.traceId === undefined ? {} : { traceId: context.frame.traceId }),
        });
      },
    };
  }
}

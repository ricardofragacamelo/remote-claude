import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AttachSessionUseCase } from '@application/session';
import { payloadOf } from '../frame-payload';
import type { WsCommandContext, WsCommandHandler, WsCommandOutcome } from '../ws-command';

const attachSchema = z.object({
  sessionId: z.string().min(1),
  resumeFromSeq: z.number().int().nonnegative().optional(),
});

/**
 * `session.attach` — start watching, and catch up on what was missed.
 *
 * The ack goes out first and the replayed events follow it, so a client always learns whether it
 * has a gap before it starts applying events.
 */
@Injectable()
export class SessionAttachHandler implements WsCommandHandler {
  readonly type = 'session.attach';

  constructor(@Inject(AttachSessionUseCase) private readonly attachSession: AttachSessionUseCase) {}

  async handle(context: WsCommandContext): Promise<WsCommandOutcome> {
    const command = payloadOf(context.frame, attachSchema);

    const sessionId = await this.attachSession.execute(command.sessionId, context.userId);
    context.attach(sessionId.value);

    const replay = context.replay(sessionId.value, command.resumeFromSeq ?? null);

    return {
      ack: {
        type: 'session.attached',
        payload: {
          sessionId: sessionId.value,
          replayed: replay.events.length,
          oldestAvailableSeq: replay.oldestAvailableSeq,
          gap: replay.gap,
        },
      },
      then: replay.events,
      publish: () => undefined,
    };
  }
}

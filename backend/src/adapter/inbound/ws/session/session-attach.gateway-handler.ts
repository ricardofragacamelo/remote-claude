import { Inject, Injectable } from '@nestjs/common';
import type { Envelope } from '@remote-claude/contracts';
import { z } from 'zod';

import { RequestPermissionUseCase } from '@application/permission';
import { AttachSessionUseCase } from '@application/session';
import type { SessionId } from '@domain/session';
import { FrameBuilder } from '@infra/websocket/frame-builder';
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
 *
 * **The questions that are still open come last, and they do not come from the buffer.** The gap a
 * product suffers is between the client and us; the channel to the CLI never dropped, so the
 * promise `canUseTool` is holding is still pending in this process and the request only needs
 * publishing again. `query.reinitialize()` is not used and is not needed — the register of what is
 * pending is ours ([ADR-012](../../../../../docs/architecture/shared/00-decisions.md)).
 *
 * Replaying them from the ring buffer instead would hand back every question ever asked, including
 * the ones answered while the client was away.
 */
@Injectable()
export class SessionAttachHandler implements WsCommandHandler {
  readonly type = 'session.attach';

  constructor(
    @Inject(AttachSessionUseCase) private readonly attachSession: AttachSessionUseCase,
    @Inject(RequestPermissionUseCase) private readonly permissions: RequestPermissionUseCase,
    @Inject(FrameBuilder) private readonly frames: FrameBuilder,
  ) {}

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
      then: [...replay.events, ...this.pendingRequests(sessionId)],
      publish: () => undefined,
    };
  }

  /** The open questions of a session, as `request` frames: unnumbered, and never buffered. */
  private pendingRequests(sessionId: SessionId): readonly Envelope[] {
    return this.permissions.pendingFor(sessionId).map((payload) =>
      this.frames.build({
        kind: 'request',
        type: 'permission.requested',
        sessionId: sessionId.value,
        payload,
      }),
    );
  }
}

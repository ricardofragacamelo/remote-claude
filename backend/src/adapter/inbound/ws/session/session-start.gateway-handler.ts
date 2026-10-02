import { Inject, Injectable } from '@nestjs/common';

import { StartSessionUseCase } from '@application/session';
import type { StartedSession } from '@application/session';
import { payloadOf } from '../frame-payload';
import { accepted, causedBy } from '../ws-command';
import type { WsCommandContext, WsCommandHandler, WsCommandOutcome } from '../ws-command';
import { sessionSchemas } from './session-commands';
import { conversationFields } from './session-conversation';

/**
 * `session.start` — open a session, or continue a conversation.
 *
 * Two answers, and which one is not the client's choice:
 *
 * - **a session was opened** — `command.accepted`, and then `session.started` on the stream of the
 *   new session. The id is the server's to mint, so it arrives on the event, not on the ack;
 * - **the conversation was already live for the caller** — `session.attached`, exactly the ack of
 *   `session.attach`. Resuming what is live *is* an attach: a second `session.started` would be a
 *   second beginning in the replay buffer of a session that began once, and a second subprocess
 *   would be two writers in one transcript (S-24). Nothing is replayed with it — the screen that
 *   follows attaches for itself, from where it is — so `replayed` is `0`, which is what it says.
 *
 * Whoever asked is watching either way: fan-out only reaches attached connections, and a caller
 * that missed the events of the session it just opened would have opened it for nobody.
 */
@Injectable()
export class SessionStartHandler implements WsCommandHandler {
  readonly type = 'session.start';

  constructor(@Inject(StartSessionUseCase) private readonly startSession: StartSessionUseCase) {}

  async handle(context: WsCommandContext): Promise<WsCommandOutcome> {
    const command = payloadOf(context.frame, sessionSchemas.start);

    const started = await this.startSession.execute({
      workspacePath: command.workspacePath,
      model: command.model ?? null,
      permissionMode: command.permissionMode ?? null,
      resumeSessionId: command.resumeSessionId ?? null,
      forkAt: command.forkAt ?? null,
      effort: command.effort ?? null,
      userId: context.userId,
      // A socket that declared an installation is the app's; a browser declares none.
      openedFrom: context.installId === null ? 'web' : 'mobile',
    });

    const sessionId = started.session.id.value;
    context.attach(sessionId);

    return started.joined ? this.joined(context, started) : this.opened(context, started);
  }

  private joined(context: WsCommandContext, started: StartedSession): WsCommandOutcome {
    const sessionId = started.session.id.value;

    return {
      ack: {
        type: 'session.attached',
        payload: {
          sessionId,
          replayed: 0,
          oldestAvailableSeq: context.replay(sessionId, null).oldestAvailableSeq,
          gap: false,
          ...conversationFields(started.conversation),
        },
      },
      then: [],
      publish: () => undefined,
    };
  }

  private opened(context: WsCommandContext, started: StartedSession): WsCommandOutcome {
    const { session, conversation } = started;

    return {
      ack: accepted(this.type),
      then: [],
      publish: () => {
        context.publish(session.id.value, {
          type: 'session.started',
          payload: {
            sessionId: session.id.value,
            workspacePath: session.workspace.value,
            model: session.model,
            permissionMode: session.permissionMode,
            ...conversationFields(conversation),
          },
          ...causedBy(context),
        });
      },
    };
  }
}

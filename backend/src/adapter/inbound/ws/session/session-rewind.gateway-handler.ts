import { Inject, Injectable } from '@nestjs/common';

import { RewindFilesUseCase, SESSION_BROADCASTER } from '@application/session';
import type { SessionBroadcaster } from '@application/session';
import { RewindIncompleteError, SessionId } from '@domain/session';
import { sessionSchemas } from './session-commands';
import { accepted, causedBy } from '../ws-command';
import type { WsCommandContext, WsCommandHandler, WsCommandOutcome } from '../ws-command';
import { payloadOf } from '../frame-payload';

/**
 * `session.rewindFiles` — puts the files a session wrote back the way they were before a turn.
 *
 * What it refuses is refused **before** the ack, as an `error` to the caller: a turn running, a
 * session that ended, a point that is not the session's, a trail that cannot take the fact. Once it
 * is accepted, the disk has been changed, and everybody watching the session is told what changed
 * with `session.rewound` — path by path, never a boolean.
 *
 * A path that could not be put back is in the event's `failed`, and an `error` with
 * `INTERNAL_ERROR` follows it to everybody watching: the event says what happened, the error says it
 * is not what was asked for. Both go out **after** the ack, like every consequence of a command.
 */
@Injectable()
export class SessionRewindHandler implements WsCommandHandler {
  readonly type = 'session.rewindFiles';

  constructor(
    @Inject(RewindFilesUseCase) private readonly rewind: RewindFilesUseCase,
    @Inject(SESSION_BROADCASTER) private readonly broadcaster: SessionBroadcaster,
  ) {}

  async handle(context: WsCommandContext): Promise<WsCommandOutcome> {
    const command = payloadOf(context.frame, sessionSchemas.rewind);
    const outcome = await this.rewind.execute({
      sessionId: command.sessionId,
      promptId: command.promptId,
      userId: context.userId,
      ...(command.paths === undefined ? {} : { paths: command.paths }),
    });

    return {
      ack: accepted(this.type),
      then: [],
      publish: () => {
        context.publish(command.sessionId, {
          type: 'session.rewound',
          payload: { ...outcome },
          ...causedBy(context),
        });

        if (outcome.failed.length > 0) {
          this.broadcaster.publishError(
            SessionId.create(command.sessionId),
            new RewindIncompleteError(outcome.promptId, outcome.failed.length),
          );
        }
      },
    };
  }
}

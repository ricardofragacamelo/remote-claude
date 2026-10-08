import type { FollowResetReason, FollowSink, FollowUpdate } from '@application/transcript';
import type { Logger } from '@shared/logging/logger';
import { NumberedStream } from '../numbered-stream';
import type { StreamTransport } from '../numbered-stream';

/** What the sinks of every connection share. */
export interface FollowTransport extends StreamTransport {
  readonly logger: Logger;
}

/**
 * The stream of one followed conversation, on one socket — plan 22, B-17.
 *
 * **`seq` is the `followId`'s**, from 1, and no session's: the frame carries no `sessionId`, and
 * nothing is kept for a replay — there is none; a reconnect follows again. The reset is the last frame,
 * with the next `seq`. The log says how many events went, never what they say: they are the
 * conversation (S-72).
 */
export class SocketFollowSink extends NumberedStream implements FollowSink {
  private ended = false;

  constructor(
    connectionId: string,
    private readonly followTransport: FollowTransport,
  ) {
    super(connectionId, followTransport);
  }

  appended(followId: string, conversationId: string, update: FollowUpdate): void {
    const seq = this.send('transcript.appended', {
      followId,
      conversationId,
      events: update.events,
      ...(update.lastMessageId === null ? {} : { lastMessageId: update.lastMessageId }),
      activity: update.activity,
      working: update.working,
    });

    this.followTransport.logger.debug(
      {
        op: 'transcript.follow',
        layer: 'adapter',
        connectionId: this.connectionId,
        followId,
        conversationId,
        seq,
        events: update.events.length,
        activity: update.activity,
        working: update.working,
      },
      'conversation update sent',
    );
  }

  reset(followId: string, conversationId: string, reason: FollowResetReason): void {
    const seq = this.send('transcript.reset', { followId, conversationId, reason });

    this.followTransport.logger.info(
      {
        op: 'transcript.follow',
        layer: 'adapter',
        connectionId: this.connectionId,
        followId,
        conversationId,
        seq,
        reason,
      },
      'conversation follow reset',
    );
  }

  end(): void {
    this.ended = true;
  }

  /** One numbered event of this subscription, unless it ended; the `seq` it got. */
  override send(type: string, payload: Readonly<Record<string, unknown>>): number | null {
    return this.ended ? null : super.send(type, payload);
  }
}

/** Opens one sink per subscription, over the transport every connection shares. */
export class SocketFollowSinks {
  constructor(private readonly transport: FollowTransport) {}

  open(connectionId: string): SocketFollowSink {
    return new SocketFollowSink(connectionId, this.transport);
  }
}

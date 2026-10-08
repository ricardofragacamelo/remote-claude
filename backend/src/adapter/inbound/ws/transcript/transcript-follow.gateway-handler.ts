import { z } from 'zod';

import type { FollowTranscriptUseCase } from '@application/transcript';
import { ClaudeSessionId } from '@domain/transcript';
import type { Logger } from '@shared/logging/logger';
import type { WsCommandContext, WsCommandHandler, WsCommandOutcome } from '../ws-command';
import { ContractCommandHandler } from '../contract-command.gateway-handler';
import { payloadOf } from '../frame-payload';
import type { SocketFollowSinks } from './socket-follow.sinks';

/** A UUID in the canonical form the SDK hands out — the id of a conversation, and of an entry. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The payloads of the `transcript.*` commands, as the contract declares them. */
export const transcriptFollowSchemas = {
  follow: z.object({
    conversationId: z.string().regex(UUID),
    afterMessageId: z.string().regex(UUID).optional(),
  }),
  unfollow: z.object({ followId: z.string().min(1).max(128) }),
};

/**
 * `transcript.follow` — follow a conversation this backend does not run (plan 22, B-17).
 *
 * It answers its **own** ack, `transcript.following`, naming the subscription; the updates then arrive
 * on the stream of that `followId`. The subscription starts delivering only once the gateway has sent
 * the ack — its first update is everything after `afterMessageId` — so nothing of it can overtake the
 * ack (S-65).
 *
 * A refusal is the reader's fence (`NOT_FOUND`), `TRANSCRIPT_FOLLOW_LIVE_HERE` or
 * `TRANSCRIPT_FOLLOW_LIMIT` — an `error` frame, and the socket stays.
 */
export class TranscriptFollowHandler implements WsCommandHandler {
  readonly type = 'transcript.follow';

  constructor(
    private readonly follower: FollowTranscriptUseCase,
    private readonly sinks: SocketFollowSinks,
    private readonly logger: Logger,
  ) {}

  async handle(context: WsCommandContext): Promise<WsCommandOutcome> {
    const { connectionId, userId, frame } = context;
    const command = payloadOf(frame, transcriptFollowSchemas.follow);
    const following = await this.follower.follow({
      connectionId,
      userId,
      conversationId: ClaudeSessionId.create(command.conversationId),
      afterMessageId: command.afterMessageId ?? null,
      sink: this.sinks.open(connectionId),
    });

    this.logger.debug(
      {
        op: 'transcript.follow',
        layer: 'adapter',
        connectionId,
        followId: following.followId,
        conversationId: following.conversationId,
        afterMessageId: command.afterMessageId ?? null,
        activity: following.activity,
        conversations: this.follower.followedConversations,
        subscriptions: this.follower.subscriptions,
      },
      'conversation followed',
    );

    return {
      ack: {
        type: 'transcript.following',
        payload: {
          followId: following.followId,
          conversationId: following.conversationId,
          activity: following.activity,
        },
      },
      then: [],
      publish: () => {
        following.start();
      },
    };
  }
}

/**
 * `transcript.unfollow` — idempotent: a subscription that already ended, or never was this
 * connection's, is acknowledged all the same (S-66).
 */
export function transcriptUnfollowHandler(
  follower: FollowTranscriptUseCase,
  logger: Logger,
): ContractCommandHandler<z.infer<typeof transcriptFollowSchemas.unfollow>> {
  return new ContractCommandHandler(
    'transcript.unfollow',
    transcriptFollowSchemas.unfollow,
    (command, context: WsCommandContext) => {
      const known = follower.unfollow(context.connectionId, command.followId);

      logger.debug(
        {
          op: 'transcript.follow',
          layer: 'adapter',
          connectionId: context.connectionId,
          followId: command.followId,
          known,
          conversations: follower.followedConversations,
          subscriptions: follower.subscriptions,
        },
        'conversation unfollowed',
      );
    },
  );
}

import { describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { TranscriptStoreRegistry } from '@application/transcript';
import type { FollowRequest, FollowTranscriptUseCase } from '@application/transcript';
import type { SocketFollowSinks } from '@adapter/inbound/ws/transcript/socket-follow.sinks';
import {
  TranscriptFollowHandler,
  transcriptUnfollowHandler,
} from '@adapter/inbound/ws/transcript/transcript-follow.gateway-handler';
import type { WsCommandContext } from '@adapter/inbound/ws/ws-command';
import { UserId } from '@domain/auth';
import { InvalidConversationRefError } from '@domain/engine';
import { InputValidationError } from '@shared/errors/input-validation.error';
import { conversationId } from '../../../../../support/builders/transcript.builder';
import { InMemoryTranscriptStore } from '../../../../../support/fakes/in-memory-transcript.store';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

/** The history of the engines enabled — one, as the product has. */
const engines = new TranscriptStoreRegistry([new InMemoryTranscriptStore()], 'claude');

/** A command frame on a connection, as the gateway hands it over. */
function contextOf(type: string, payload: Record<string, unknown>): WsCommandContext {
  return {
    connectionId: 'c1',
    userId: UserId.create('auth|owner'),
    frame: { v: 1, id: 'f1', kind: 'command', type, ts: '', payload } as Envelope,
  } as unknown as WsCommandContext;
}

/** A follower that records what it was asked and answers a known subscription. */
function aFollower() {
  const asked: FollowRequest[] = [];
  const started: string[] = [];
  const unfollowed: string[] = [];
  const follower = {
    followedConversations: 1,
    subscriptions: 1,
    follow: (request: FollowRequest) => {
      asked.push(request);
      return Promise.resolve({
        followId: 't_1',
        conversation: request.conversationId,
        activity: 'idle',
        start: () => started.push('t_1'),
      });
    },
    unfollow: (_connection: string, followId: string) => {
      unfollowed.push(followId);
      return false;
    },
  } as unknown as FollowTranscriptUseCase;

  return { follower, asked, started, unfollowed };
}

const sinks = { open: () => ({}) } as unknown as SocketFollowSinks;

describe('transcript.follow — plan 22, B-17', () => {
  it('acks with the subscription, and starts it only when the gateway publishes — S-65', async () => {
    const { follower, asked, started } = aFollower();
    const log = new RecordingLogger();

    const outcome = await new TranscriptFollowHandler(follower, sinks, log.logger, engines).handle(
      contextOf('transcript.follow', {
        conversation: { engine: 'claude', id: conversationId(1) },
        afterMessageId: conversationId(2),
      }),
    );

    expect(outcome.ack).toEqual({
      type: 'transcript.following',
      payload: {
        followId: 't_1',
        conversation: { engine: 'claude', id: conversationId(1) },
        activity: 'idle',
      },
    });
    expect(asked[0]).toMatchObject({ connectionId: 'c1', afterMessageId: conversationId(2) });
    expect(started).toEqual([]);

    outcome.publish();
    expect(started).toEqual(['t_1']);
    expect(log.withOp('transcript.follow')).toHaveLength(1);
  });

  it('follows an empty conversation from nothing', async () => {
    const { follower, asked } = aFollower();

    await new TranscriptFollowHandler(
      follower,
      sinks,
      new RecordingLogger().logger,
      engines,
    ).handle(
      contextOf('transcript.follow', { conversation: { engine: 'claude', id: conversationId(1) } }),
    );

    expect(asked[0]?.afterMessageId).toBeNull();
  });

  it.each([
    ['an id the engine never hands out', { engine: 'claude', id: 'not-a-uuid' }],
    ['an engine that is not enabled', { engine: 'codex', id: conversationId(1) }],
  ])(
    'refuses %s as INVALID_INPUT, before the follower is asked — plan 28, S-25',
    async (_case, conversation) => {
      const { follower, asked } = aFollower();

      await expect(
        new TranscriptFollowHandler(follower, sinks, new RecordingLogger().logger, engines).handle(
          contextOf('transcript.follow', { conversation }),
        ),
      ).rejects.toBeInstanceOf(InvalidConversationRefError);
      expect(asked).toEqual([]);
    },
  );

  it.each([
    [{ conversation: { engine: 'claude' } }],
    [{ conversation: { engine: 'claude', id: conversationId(1) }, afterMessageId: 42 }],
    [{ conversationId: conversationId(1) }],
    [{}],
  ])('refuses %j with every invalid field — S-69', async (payload) => {
    const { follower } = aFollower();

    await expect(
      new TranscriptFollowHandler(follower, sinks, new RecordingLogger().logger, engines).handle(
        contextOf('transcript.follow', payload),
      ),
    ).rejects.toBeInstanceOf(InputValidationError);
  });

  it('acknowledges an unfollow of a subscription it does not know — S-66', async () => {
    const { follower, unfollowed } = aFollower();
    const log = new RecordingLogger();

    const outcome = await transcriptUnfollowHandler(follower, log.logger).handle(
      contextOf('transcript.unfollow', { followId: 't_9' }),
    );

    expect(outcome.ack).toEqual({
      type: 'command.accepted',
      payload: { command: 'transcript.unfollow' },
    });
    expect(unfollowed).toEqual(['t_9']);
    expect(log.withOp('transcript.follow')).toEqual([expect.objectContaining({ known: false })]);
  });
});

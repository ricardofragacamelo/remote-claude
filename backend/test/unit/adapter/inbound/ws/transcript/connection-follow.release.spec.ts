import { describe, expect, it } from 'vitest';

import type { FollowTranscriptUseCase } from '@application/transcript';
import { ConnectionFollowRelease } from '@adapter/inbound/ws/transcript/connection-follow.release';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const socket = { send: () => undefined, close: () => undefined };
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('ConnectionFollowRelease — a socket takes its conversations with it — plan 22, S-67', () => {
  it('releases what a connection followed when it leaves the registry, and logs it', async () => {
    const registry = new ConnectionRegistry();
    const log = new RecordingLogger();
    const released: string[] = [];
    const follower = {
      followedConversations: 1,
      release: (connectionId: string) => {
        released.push(connectionId);
        return connectionId === 'c1' ? 2 : 0;
      },
    } as unknown as FollowTranscriptUseCase;
    const release = new ConnectionFollowRelease(registry, follower, log.logger);
    release.onModuleInit();
    registry.register('c1', socket);
    registry.register('c2', socket);

    registry.remove('c1');
    registry.remove('c2');
    await settle();
    release.onModuleDestroy();

    expect(released).toEqual(['c1', 'c2']);
    expect(log.withOp('transcript.follow')).toEqual([
      expect.objectContaining({
        level: 'debug',
        connectionId: 'c1',
        released: 2,
        conversations: 1,
      }),
    ]);
  });
});

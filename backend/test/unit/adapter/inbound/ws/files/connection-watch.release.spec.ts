import { describe, expect, it } from 'vitest';

import type { FolderWatches } from '@application/files';
import { ConnectionWatchRelease } from '@adapter/inbound/ws/files/connection-watch.release';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const socket = { send: () => undefined, close: () => undefined };

/** The watched folders, as far as the release needs them: how many each connection had. */
function watchesHolding(held: Readonly<Record<string, number>>) {
  const released: string[] = [];
  const watches = {
    openWatchers: 0,
    release: (connectionId: string) => {
      released.push(connectionId);
      return Promise.resolve(held[connectionId] ?? 0);
    },
  } as unknown as FolderWatches;

  return { watches, released };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('ConnectionWatchRelease — a socket takes its folders with it — S-142', () => {
  it('releases what a connection held when it leaves the registry, and logs it', async () => {
    const registry = new ConnectionRegistry();
    const log = new RecordingLogger();
    const { watches, released } = watchesHolding({ c1: 2 });
    const release = new ConnectionWatchRelease(registry, watches, log.logger);
    release.onModuleInit();
    registry.register('c1', socket);
    registry.register('c2', socket);

    registry.remove('c1');
    registry.remove('c2');
    await settle();

    expect(released).toEqual(['c1', 'c2']);
    expect(log.withOp('files.watch')).toEqual([
      expect.objectContaining({ level: 'debug', connectionId: 'c1', released: 2 }),
    ]);
  });

  it('stops listening when the module goes down', async () => {
    const registry = new ConnectionRegistry();
    const { watches, released } = watchesHolding({});
    const release = new ConnectionWatchRelease(registry, watches, new RecordingLogger().logger);
    release.onModuleInit();
    release.onModuleDestroy();
    release.onModuleDestroy();
    registry.register('c1', socket);

    registry.remove('c1');
    await settle();

    expect(released).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Sendable } from '@infra/websocket/connection-registry';

const socket = (): Sendable => ({ send: () => undefined, close: () => undefined });

describe('ConnectionRegistry', () => {
  let registry: ConnectionRegistry;

  beforeEach(() => {
    registry = new ConnectionRegistry();
  });

  it('registers a connection that has not authenticated yet', () => {
    const connection = registry.register('c1', socket());

    expect(connection.userId).toBeNull();
    expect(connection.locale).toBe('en');
    expect(connection.attached.size).toBe(0);
  });

  it('finds a connection by id', () => {
    registry.register('c1', socket());

    expect(registry.get('c1')?.id).toBe('c1');
  });

  it('answers null for a connection it does not know', () => {
    expect(registry.get('nope')).toBeNull();
  });

  it('forgets a connection', () => {
    registry.register('c1', socket());

    registry.remove('c1');

    expect(registry.get('c1')).toBeNull();
    expect(registry.size).toBe(0);
  });

  it('lists every connection watching a session', () => {
    const first = registry.register('c1', socket());
    const second = registry.register('c2', socket());
    registry.register('c3', socket());
    first.attached.add('s1');
    second.attached.add('s1');

    expect(registry.forSession('s1').map((connection) => connection.id)).toEqual(['c1', 'c2']);
  });

  it('lists nobody for a session no connection is watching', () => {
    registry.register('c1', socket());

    expect(registry.forSession('s1')).toEqual([]);
  });
});

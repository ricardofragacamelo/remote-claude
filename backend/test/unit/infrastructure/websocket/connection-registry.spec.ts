import { beforeEach, describe, expect, it } from 'vitest';

import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Sendable } from '@infra/websocket/connection-registry';
import { UserId } from '@domain/auth';

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
    expect(connection.installId).toBeNull();
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

  describe('forDevice', () => {
    const owner = UserId.create('auth|owner');
    const other = UserId.create('auth|other');

    /** Registers a connection as the handshake would leave it. */
    const authenticated = (id: string, userId: UserId | null, installId: string | null): void => {
      const connection = registry.register(id, socket());
      connection.userId = userId;
      connection.installId = installId;
    };

    it('lists every connection of one installation — a phone may hold more than one', () => {
      authenticated('c1', owner, 'install-1');
      authenticated('c2', owner, 'install-1');
      authenticated('c3', owner, 'install-2');

      expect(registry.forDevice(owner, 'install-1').map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    // The installation id is only unique inside an account: two people on one phone are two
    // devices, and revoking one may not drop the other's socket.
    it('never lists the same installation of another user', () => {
      authenticated('c1', other, 'install-1');

      expect(registry.forDevice(owner, 'install-1')).toEqual([]);
    });

    it('never lists a browser, which has no installation', () => {
      authenticated('c1', owner, null);

      expect(registry.forDevice(owner, 'install-1')).toEqual([]);
    });

    it('never lists a socket that has not finished the handshake', () => {
      const connection = registry.register('c1', socket());
      connection.installId = 'install-1';

      expect(registry.forDevice(owner, 'install-1')).toEqual([]);
    });
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import { RegistryDeviceConnections } from '@adapter/outbound/auth/registry-device-connections';
import { UserId } from '@domain/auth';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Sendable } from '@infra/websocket/connection-registry';
import { CLOSE } from '@infra/websocket/limits';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const owner = UserId.create('auth|owner');
const other = UserId.create('auth|other');

/** A socket that remembers how it was closed. */
class FakeSocket implements Sendable {
  readonly closes: { code: number | undefined; reason: string | undefined }[] = [];

  send(): void {
    // Nothing on this path sends.
  }

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason });
  }
}

let registry: ConnectionRegistry;
let logger: RecordingLogger;

beforeEach(() => {
  registry = new ConnectionRegistry();
  logger = new RecordingLogger();
});

/** Registers an authenticated connection, as the handshake would leave it. */
function connect(id: string, userId: UserId | null, installId: string | null): FakeSocket {
  const socket = new FakeSocket();
  const connection = registry.register(id, socket);
  connection.userId = userId;
  connection.installId = installId;

  return socket;
}

describe('RegistryDeviceConnections', () => {
  // S-07: the sockets of the revoked device go at once, with 4401.
  it('closes every connection of that installation with 4401', () => {
    const first = connect('c1', owner, 'install-1');
    const second = connect('c2', owner, 'install-1');

    const closed = new RegistryDeviceConnections(registry, logger.logger).closeForDevice(
      owner,
      'install-1',
    );

    expect(closed).toBe(2);
    expect(first.closes).toEqual([{ code: CLOSE.authenticationFailed, reason: 'device revoked' }]);
    expect(second.closes).toHaveLength(1);
  });

  it('leaves the browser alone — it has no installation and is not a device', () => {
    const browser = connect('c1', owner, null);

    new RegistryDeviceConnections(registry, logger.logger).closeForDevice(owner, 'install-1');

    expect(browser.closes).toHaveLength(0);
  });

  // The installation id is only unique inside an account: two people on one phone are two devices.
  it('leaves the same installation of another user connected', () => {
    const theirs = connect('c1', other, 'install-1');

    new RegistryDeviceConnections(registry, logger.logger).closeForDevice(owner, 'install-1');

    expect(theirs.closes).toHaveLength(0);
  });

  it('closing nothing is an ordinary outcome, not a failure', () => {
    expect(
      new RegistryDeviceConnections(registry, logger.logger).closeForDevice(owner, 'install-1'),
    ).toBe(0);
  });

  it('says how many it closed, at info — a revocation is a fact worth finding in a log', () => {
    connect('c1', owner, 'install-1');

    new RegistryDeviceConnections(registry, logger.logger).closeForDevice(owner, 'install-1');

    expect(logger.withOp('device.revoke')).toMatchObject([{ level: 'info', closed: 1 }]);
  });
});

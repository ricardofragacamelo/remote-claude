import { Inject, Injectable } from '@nestjs/common';

import type { DeviceConnections } from '@application/auth';
import type { UserId } from '@domain/auth';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import { CLOSE } from '@infra/websocket/limits';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * Revocation reaching the sockets that are already open.
 *
 * A thin adapter, and what it exists for is the direction of the dependency: the registry lives in
 * `infrastructure/websocket/` and the use case lives in `application/`, so a use case that reached
 * for the registry would have the arrow pointing outward.
 *
 * `4401` and not `4400`: the client's credential stopped being good, which is a thing it should
 * react to by renewing and finding out it may not come back — not a protocol bug it should stop
 * reconnecting over.
 */
@Injectable()
export class RegistryDeviceConnections implements DeviceConnections {
  constructor(
    @Inject(ConnectionRegistry) private readonly registry: ConnectionRegistry,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  closeForDevice(userId: UserId, installId: string): number {
    const connections = this.registry.forDevice(userId, installId);

    for (const connection of connections) {
      // The socket's own close event is what takes the connection out of the registry and clears
      // the gateway's timers, exactly as a disconnect from the other end does. Removing it here as
      // well would leave those timers running against a connection nobody can find.
      connection.socket.close(CLOSE.authenticationFailed, 'device revoked');
    }

    this.logger.info(
      {
        op: 'device.revoke',
        layer: 'adapter',
        module: 'auth',
        userId: userId.value,
        closed: connections.length,
      },
      'closed the connections of a revoked device',
    );

    return connections.length;
  }
}

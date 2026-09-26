import { Inject, Injectable } from '@nestjs/common';

import { ListApprovedDevicesUseCase } from '@application/auth';
import type { PushAudience } from '@application/notification';
import type { Device, UserId } from '@domain/auth';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';

/**
 * Who can be reached, and whether anybody is already looking.
 *
 * Two questions from two places — `auth` owns the devices, the transport owns the connections —
 * answered behind one port, because `notification` asks them together and they add up to one
 * decision: is a push a help, or an interruption?
 *
 * A thin adapter, and what it exists for is the direction of the dependency: the registry lives
 * in `infrastructure/websocket/` and `auth` is another module, so a use case reaching for either
 * would have the arrow pointing outward.
 */
@Injectable()
export class RegistryPushAudience implements PushAudience {
  constructor(
    @Inject(ListApprovedDevicesUseCase) private readonly devices: ListApprovedDevicesUseCase,
    @Inject(ConnectionRegistry) private readonly connections: ConnectionRegistry,
  ) {}

  async approvedDevices(userId: UserId): Promise<readonly Device[]> {
    return this.devices.execute(userId);
  }

  /**
   * Whether a connection **of this user** is attached to that session.
   *
   * Scoped by user as well as by session, and that is not belt and braces: a session is watched
   * by whoever may watch it, and "somebody is looking" has to mean somebody who could answer.
   */
  isWatching(userId: UserId, sessionId: string): boolean {
    return this.connections
      .forSession(sessionId)
      .some((connection) => connection.userId?.value === userId.value);
  }
}

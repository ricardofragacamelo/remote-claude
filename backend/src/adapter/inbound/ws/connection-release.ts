import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import type { ConnectionRegistry } from '@infra/websocket/connection-registry';

/**
 * What a socket held goes with it — the folders it watched, the conversations it followed.
 *
 * Whatever took the connection out of the registry — the client closing, the heartbeat, a revocation
 * closing it with `4401`, a failed send, the shutdown — this hears it once and hands it to
 * {@link release}. The gateway keeps no branch for it: the registry tells, and this is who listens.
 */
export abstract class ConnectionRelease implements OnModuleInit, OnModuleDestroy {
  private stopListening: (() => void) | null = null;

  protected constructor(private readonly registry: ConnectionRegistry) {}

  onModuleInit(): void {
    this.stopListening = this.registry.onRemoved((connectionId) => {
      void this.release(connectionId);
    });
  }

  onModuleDestroy(): void {
    this.stopListening?.();
    this.stopListening = null;
  }

  /** Lets go of everything the connection held. Never throws: the socket is already gone. */
  protected abstract release(connectionId: string): Promise<void>;
}

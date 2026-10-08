import type { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { FrameBuilder } from '@infra/websocket/frame-builder';
import type { SessionHub } from '@infra/websocket/session-hub';

/** What a subscription's stream needs to reach its socket. */
export interface StreamTransport {
  readonly registry: ConnectionRegistry;
  readonly frames: FrameBuilder;
  readonly hub: Pick<SessionHub, 'deliver'>;
}

/**
 * The events of one subscription, to one connection, numbered by the subscription.
 *
 * `seq` from 1, belonging to the subscription and to no session: the frame carries no `sessionId`, and
 * nothing is kept for a replay — there is none, and a reconnect subscribes again. A folder watched
 * (07 · D-07) and a conversation followed (22 · B-17) keep the same rule, written once here.
 */
export class NumberedStream {
  private seq = 0;

  constructor(
    protected readonly connectionId: string,
    private readonly transport: StreamTransport,
  ) {}

  /** Whether the connection is still there. */
  get open(): boolean {
    return this.transport.registry.get(this.connectionId) !== null;
  }

  /** One numbered event; the `seq` it got, or `null` when the connection is gone. */
  send(type: string, payload: Readonly<Record<string, unknown>>): number | null {
    const connection = this.transport.registry.get(this.connectionId);

    if (connection === null) {
      return null;
    }

    this.seq += 1;
    this.transport.hub.deliver(
      connection,
      this.transport.frames.build({ kind: 'event', type, payload, seq: this.seq }),
    );
    return this.seq;
  }
}

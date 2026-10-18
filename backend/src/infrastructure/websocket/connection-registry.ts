import type { UserId } from '@domain/auth';

/** The half of a socket this code needs. Narrow on purpose, so a test can stand in for it. */
export interface Sendable {
  send(data: string): void;
  close(code?: number, reason?: string): void;

  /**
   * Bytes queued on the socket and not yet handed to the network — how far behind this client is.
   * Absent from a stand-in that never falls behind.
   */
  readonly bufferedAmount?: number;
}

/** Told when a connection leaves the registry, whatever took it out. */
export type ConnectionRemoved = (connectionId: string) => void;

/** One open connection, and everything known about it. */
export interface Connection {
  readonly id: string;
  readonly socket: Sendable;
  userId: UserId | null;
  locale: string;

  /**
   * The installation this socket belongs to, when the client is a device.
   *
   * `null` is the browser. It is kept on the connection rather than looked up per command for one
   * reason: revoking a device has to close its sockets **now**, and a lookup cannot find a socket
   * that never said which device it was.
   */
  installId: string | null;

  expiresAt: Date | null;
  readonly attached: Set<string>;
}

/**
 * Who is connected, and to what.
 *
 * One session is watched by many connections — the desktop browser, the phone, a second tab — and
 * this is what turns a session id into the list of sockets that have to hear about it.
 */
export class ConnectionRegistry {
  private readonly connections = new Map<string, Connection>();
  private readonly removed = new Set<ConnectionRemoved>();

  /** Registers a socket that has not authenticated yet. */
  register(id: string, socket: Sendable): Connection {
    const connection: Connection = {
      id,
      socket,
      userId: null,
      locale: 'en',
      installId: null,
      expiresAt: null,
      attached: new Set<string>(),
    };

    this.connections.set(id, connection);
    return connection;
  }

  get(id: string): Connection | null {
    return this.connections.get(id) ?? null;
  }

  /**
   * Takes a connection out, and tells whoever holds something on its behalf — once, however many
   * ways its end arrives (a close, a disconnect, a failed send, the shutdown).
   */
  remove(id: string): void {
    if (!this.connections.delete(id)) {
      return;
    }

    for (const listener of this.removed) {
      listener(id);
    }
  }

  /**
   * Hears every connection that leaves — the hook a module uses to let go of what a socket held,
   * without a branch of its business in the gateway (the watched folders of plan 07, S-142).
   *
   * @returns the way to stop hearing
   */
  onRemoved(listener: ConnectionRemoved): () => void {
    this.removed.add(listener);

    return () => {
      this.removed.delete(listener);
    };
  }

  /**
   * Every connection of one installation of one user.
   *
   * Scoped by user as well as by installation, because the installation id is only unique inside
   * an account: two people on the same phone are two devices, and revoking one may not drop the
   * other's socket.
   */
  forDevice(userId: UserId, installId: string): Connection[] {
    return [...this.connections.values()].filter(
      (connection) =>
        connection.installId === installId && connection.userId?.value === userId.value,
    );
  }

  /** Every connection watching a session. */
  forSession(sessionId: string): Connection[] {
    return [...this.connections.values()].filter((connection) =>
      connection.attached.has(sessionId),
    );
  }

  get size(): number {
    return this.connections.size;
  }
}

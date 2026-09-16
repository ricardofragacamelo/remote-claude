import type { UserId } from '@domain/auth';

/** The half of a socket this code needs. Narrow on purpose, so a test can stand in for it. */
export interface Sendable {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** One open connection, and everything known about it. */
export interface Connection {
  readonly id: string;
  readonly socket: Sendable;
  userId: UserId | null;
  locale: string;
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

  /** Registers a socket that has not authenticated yet. */
  register(id: string, socket: Sendable): Connection {
    const connection: Connection = {
      id,
      socket,
      userId: null,
      locale: 'en',
      expiresAt: null,
      attached: new Set<string>(),
    };

    this.connections.set(id, connection);
    return connection;
  }

  get(id: string): Connection | null {
    return this.connections.get(id) ?? null;
  }

  remove(id: string): void {
    this.connections.delete(id);
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

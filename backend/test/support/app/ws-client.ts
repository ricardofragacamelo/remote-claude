import { WebSocket } from 'ws';
import type { Envelope } from '@remote-claude/contracts';

/** How a socket ended. */
export interface Closure {
  readonly code: number;
  readonly reason: string;
}

/** A frame as a client would send it, with the envelope fields filled in. */
export function commandFrame(
  type: string,
  payload: Readonly<Record<string, unknown>>,
  overrides: Partial<Envelope> = {},
): Record<string, unknown> {
  return {
    v: 1,
    id: `cmd-${Math.random().toString(36).slice(2, 10)}`,
    kind: 'command',
    type,
    ts: new Date().toISOString(),
    payload,
    ...overrides,
  };
}

/**
 * A WebSocket client for the integration suite.
 *
 * It speaks the contract over a real socket against the real gateway — no stub in between, which
 * is the only way the handshake, the close codes and the replay are actually covered.
 */
export class TestSocket {
  private readonly received: Envelope[] = [];
  private readonly waiters: ((frame: Envelope) => void)[] = [];
  private closure: Closure | null = null;
  private readonly closeWaiters: ((closure: Closure) => void)[] = [];

  private constructor(private readonly socket: WebSocket) {}

  /** Opens a socket against `http://host:port`, on the gateway's path. */
  static open(baseUrl: string): Promise<TestSocket> {
    const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/ws?v=1`);
    const client = new TestSocket(socket);

    socket.on('message', (data: Buffer) => {
      client.accept(JSON.parse(data.toString('utf8')) as Envelope);
    });
    socket.on('close', (code: number, reason: Buffer) => {
      client.finish({ code, reason: reason.toString('utf8') });
    });

    return new Promise((resolve, reject) => {
      socket.on('open', () => resolve(client));
      socket.on('error', reject);
    });
  }

  send(frame: Record<string, unknown> | string): void {
    this.socket.send(typeof frame === 'string' ? frame : JSON.stringify(frame));
  }

  /** The next frame, or the first one already queued. */
  next(): Promise<Envelope> {
    const queued = this.received.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no frame arrived')), 5_000);
      this.waiters.push((frame) => {
        clearTimeout(timer);
        resolve(frame);
      });
    });
  }

  /** How the socket closed, waiting if it has not yet. */
  closed(timeoutMs = 10_000): Promise<Closure> {
    if (this.closure !== null) {
      return Promise.resolve(this.closure);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket stayed open')), timeoutMs);
      this.closeWaiters.push((closure) => {
        clearTimeout(timer);
        resolve(closure);
      });
    });
  }

  /** Whether the socket is still usable. */
  get isOpen(): boolean {
    return this.closure === null && this.socket.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.socket.close();
  }

  private accept(frame: Envelope): void {
    const waiter = this.waiters.shift();
    if (waiter === undefined) {
      this.received.push(frame);
      return;
    }

    waiter(frame);
  }

  private finish(closure: Closure): void {
    this.closure = closure;
    for (const waiter of this.closeWaiters.splice(0)) {
      waiter(closure);
    }
  }
}

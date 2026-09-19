import { randomUUID } from 'node:crypto';

import { PROTOCOL_VERSION, isEnvelope } from '@remote-claude/contracts';
import type { Envelope } from '@remote-claude/contracts';
import WebSocket from 'ws';

import { environment } from './environment';

/**
 * A WebSocket client for the suite.
 *
 * Deliberately not the application's `wsClient`: importing `web/src` would turn an end-to-end test
 * into an integration test wearing its clothes, and would stop proving the one thing this level is
 * for — that the **contract** works for anybody who speaks it. So this speaks the protocol from
 * the outside, validating every frame against the same generated guard the three ends use.
 */
export class E2eSocket {
  private readonly socket: WebSocket;
  private readonly received: Envelope[] = [];
  private readonly waiters: { match: (frame: Envelope) => boolean; settle: () => void }[] = [];
  private closure: { code: number; reason: string } | null = null;

  private constructor(url: string) {
    this.socket = new WebSocket(`${url}?v=${String(PROTOCOL_VERSION)}`);

    this.socket.on('message', (data: Buffer) => {
      const parsed: unknown = JSON.parse(data.toString('utf8'));

      if (!isEnvelope(parsed)) {
        throw new Error(
          `the server sent a frame that is not an envelope: ${data.toString('utf8')}`,
        );
      }

      this.received.push(parsed);
      this.settle();
    });

    this.socket.on('close', (code: number, reason: Buffer) => {
      this.closure = { code, reason: reason.toString('utf8') };
      this.settle();
    });
  }

  /** Opens a socket and waits for the TCP handshake, not for the protocol one. */
  static async open(url: string = environment.wsUrl): Promise<E2eSocket> {
    const client = new E2eSocket(url);

    await new Promise<void>((resolve, reject) => {
      client.socket.once('open', resolve);
      client.socket.once('error', reject);
    });

    return client;
  }

  /** How the server closed this socket, or `null` while it is still open. */
  get closedWith(): { code: number; reason: string } | null {
    return this.closure;
  }

  /** Every frame received so far, in arrival order. */
  get frames(): readonly Envelope[] {
    return this.received;
  }

  /** Sends a command and answers the `id` it was given, so a caller can correlate the ack. */
  send(type: string, payload: Readonly<Record<string, unknown>>): string {
    const id = randomUUID();

    this.socket.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        id,
        kind: 'command',
        type,
        ts: new Date().toISOString(),
        traceId: randomUUID(),
        payload,
      } satisfies Envelope),
    );

    return id;
  }

  /**
   * The handshake, from the token to `connection.ready`.
   *
   * @returns the `connection.ready` frame, whose payload carries the server's limits
   */
  async authenticate(accessToken: string): Promise<Envelope> {
    this.send('connection.authenticate', {
      token: accessToken,
      locale: 'en',
      client: { kind: 'web', version: 'e2e' },
    });

    return this.waitFor((frame) => frame.type === 'connection.ready');
  }

  /**
   * Waits for the first frame — already received or still to come — that matches.
   *
   * There is no `sleep` anywhere in the suite: a wait is always on a condition. A closed socket
   * rejects immediately rather than burning the timeout, so "the server dropped us" never reads
   * as "the server was slow".
   */
  waitFor(match: (frame: Envelope) => boolean, timeoutMs = 15_000): Promise<Envelope> {
    const found = this.received.find(match);
    if (found !== undefined) {
      return Promise.resolve(found);
    }

    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`no frame matched within ${String(timeoutMs)}ms`));
      }, timeoutMs);

      const settle = (): void => {
        const frame = this.received.find(match);

        if (frame !== undefined) {
          clearTimeout(timer);
          resolve(frame);
          return;
        }

        if (this.closure !== null) {
          clearTimeout(timer);
          reject(
            new Error(`the socket closed with ${String(this.closure.code)} before it matched`),
          );
        }
      };

      this.waiters.push({ match, settle });
      settle();
    });
  }

  /** Waits for the server to close the socket, and answers the code it used. */
  waitForClose(timeoutMs = 15_000): Promise<{ code: number; reason: string }> {
    if (this.closure !== null) {
      return Promise.resolve(this.closure);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`the socket was still open after ${String(timeoutMs)}ms`));
      }, timeoutMs);

      this.socket.once('close', (code: number, reason: Buffer) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString('utf8') });
      });
    });
  }

  /** Closes the socket the way a well-behaved client does. */
  close(): void {
    this.socket.close(1000, 'e2e finished');
  }

  /**
   * Cuts the connection without a close frame, the way a lost network does.
   *
   * Not the same as {@link close}: a normal closure is a client saying goodbye, and the one thing
   * replay exists for is the connection that did **not**.
   */
  drop(): void {
    this.socket.terminate();
  }

  /** Answers a `request` frame the server is waiting on, naming the question in `correlationId`. */
  respond(frame: Envelope, payload: Readonly<Record<string, unknown>>): void {
    this.socket.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        id: randomUUID(),
        kind: 'response',
        type: frame.type.replace('.requested', '.resolve'),
        ts: new Date().toISOString(),
        correlationId: frame.id,
        traceId: randomUUID(),
        payload,
      } satisfies Envelope),
    );
  }

  private settle(): void {
    for (const waiter of [...this.waiters]) {
      waiter.settle();
    }
  }
}

/** Payload of a `diag.pong`, as the suite reads it. */
export interface PongLike {
  readonly sessionId: string;
  readonly pingCount: number;
  readonly nonce: string;
}

/** Reads a pong's payload, failing loudly rather than producing `undefined` downstream. */
export function pongOf(frame: Envelope): PongLike {
  const payload = frame.payload as Partial<PongLike> | undefined;

  if (
    payload === undefined ||
    typeof payload.sessionId !== 'string' ||
    typeof payload.pingCount !== 'number' ||
    typeof payload.nonce !== 'string'
  ) {
    throw new Error(`this is not a diag.pong: ${JSON.stringify(frame)}`);
  }

  return { sessionId: payload.sessionId, pingCount: payload.pingCount, nonce: payload.nonce };
}

import type { SocketLike } from '@/shared/api/ws-client';

/**
 * A socket a test drives by hand.
 *
 * The real `WebSocket` cannot be opened, failed or closed on command, and the behaviour worth
 * testing here — the handshake, the backoff, the replay — is exactly what happens around those
 * moments.
 */
export class FakeSocket implements SocketLike {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  readonly sent: string[] = [];
  closedWith: number | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.closedWith = code;
    this.onclose?.({ code, reason });
  }

  /** The frames this socket was sent, parsed. */
  frames(): Record<string, unknown>[] {
    return this.sent.map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  /** Pretends the connection opened. */
  open(): void {
    this.onopen?.({});
  }

  /** Pretends a frame arrived. */
  receive(frame: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  /** Pretends the connection dropped for a reason the client should retry. */
  drop(code = 1006): void {
    this.closedWith = code;
    this.onclose?.({ code, reason: 'dropped' });
  }
}

/** Hands out sockets in order and remembers every one of them. */
export class SocketFactory {
  readonly created: FakeSocket[] = [];

  connect = (url: string): SocketLike => {
    const socket = new FakeSocket(url);
    this.created.push(socket);
    return socket;
  };

  /** The one most recently created. */
  get latest(): FakeSocket {
    const socket = this.created.at(-1);

    if (socket === undefined) {
      throw new Error('no socket has been created yet');
    }

    return socket;
  }
}

/** A scheduler the test fires by hand, so a backoff is asserted instead of waited for. */
export class ManualScheduler {
  readonly delays: number[] = [];
  private pending: (() => void)[] = [];

  schedule = (body: () => void, delayMs: number): (() => void) => {
    this.delays.push(delayMs);
    this.pending.push(body);

    return () => {
      this.pending = this.pending.filter((candidate) => candidate !== body);
    };
  };

  /** Runs everything that was waiting. */
  fire(): void {
    const due = this.pending;
    this.pending = [];

    for (const body of due) {
      body();
    }
  }
}

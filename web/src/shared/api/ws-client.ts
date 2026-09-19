import { isEnvelope, PROTOCOL_VERSION } from '@remote-claude/contracts';
import type { Envelope } from '@remote-claude/contracts';

import { newTraceId } from '@/shared/lib/trace';
import { logger } from '@/shared/logging/logger';

/** The part of a `WebSocket` this client uses. Narrow, so a test can stand in for it. */
export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** Where a connection stands, for the UI to show and for a test to assert on. */
export type ConnectionStatus = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'closed';

/** What a feature needs from the stream of one session. */
export interface SessionSubscriber {
  /**
   * One frame of this session: an `event`, or the `request` that a permission is.
   *
   * A subscriber receives **everything** the session produced, including what another subscriber
   * has already seen. That is safe by design — the store discards anything at or below its own
   * `lastSeq` — and it is what lets the conversation and the permission queue watch the same
   * session without either of them knowing the other exists.
   */
  onEvent(frame: Envelope): void;

  /** The buffer no longer holds what this subscriber missed: drop local state and reload. */
  onGap(): void;

  /** The highest `seq` the subscriber has applied, so a reconnect can resume from it. */
  lastSeq(): number;
}

/** Backoff bounds. Never a tight loop, and never longer than half a minute. */
export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/** How a delay is scheduled. Injected so a test drives time instead of waiting for it. */
export type Scheduler = (body: () => void, delayMs: number) => () => void;

/** Everything the client needs to exist. */
export interface WsClientOptions {
  readonly url: string;
  readonly accessToken: () => string | null;
  readonly locale: () => string;
  readonly appVersion: string;
  readonly connect?: (url: string) => SocketLike;
  readonly schedule?: Scheduler;
  readonly random?: () => number;
}

const defaultSchedule: Scheduler = (body, delayMs) => {
  const timer = setTimeout(body, delayMs);
  return () => clearTimeout(timer);
};

/**
 * The WebSocket client. There is exactly one in the application.
 *
 * It owns the socket: it connects, authenticates, reconnects with an exponential backoff and
 * jitter, asks for the replay it missed, validates every frame against the generated contract, and
 * renews the credential without dropping the connection. It knows nothing about React.
 *
 * The **jitter** is not decoration. Without it, every client that went down with the server comes
 * back at the same instant and takes it down again.
 */
export class WsClient {
  private socket: SocketLike | null = null;
  private status: ConnectionStatus = 'idle';
  private attempt = 0;
  private cancelRetry: (() => void) | null = null;
  private wanted = false;
  private readonly subscribers = new Map<string, Set<SessionSubscriber>>();
  private readonly observers = new Set<(frame: Envelope) => void>();
  private readonly watchers = new Set<(status: ConnectionStatus) => void>();
  private readonly schedule: Scheduler;
  private readonly random: () => number;
  private readonly open: (url: string) => SocketLike;

  constructor(private readonly options: WsClientOptions) {
    this.schedule = options.schedule ?? defaultSchedule;
    this.random = options.random ?? Math.random;
    this.open = options.connect ?? ((url) => new WebSocket(url) as unknown as SocketLike);
  }

  /** Opens the connection, and keeps it open until `close()`. */
  connect(): void {
    this.wanted = true;

    if (this.socket !== null) {
      return;
    }

    this.move('connecting');
    const socket = this.open(`${this.options.url}?v=${String(PROTOCOL_VERSION)}`);
    this.socket = socket;

    socket.onopen = () => this.handshake();
    socket.onmessage = (event) => this.receive(String(event.data));
    socket.onclose = (event) => this.dropped(event.code);
    socket.onerror = () => {
      logger.warn({ op: 'ws.connection' }, 'ws error');
    };
  }

  /** Closes for good. A normal closure is not retried. */
  close(): void {
    this.wanted = false;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.socket?.close(1000, 'client closed');
    this.socket = null;
    this.move('closed');
  }

  /** Renews the credential on an open socket, without dropping it. */
  reauthenticate(token: string): void {
    this.command('connection.reauthenticate', { token });
  }

  /** Watches the connection status. Answers the unsubscribe. */
  onStatus(watcher: (status: ConnectionStatus) => void): () => void {
    this.watchers.add(watcher);
    watcher(this.status);
    return () => this.watchers.delete(watcher);
  }

  /**
   * Subscribes to a session's frames. Answers the detach.
   *
   * **Several subscribers may watch one session**, and they do: the conversation and the
   * permission queue are different features looking at the same stream. The socket is attached
   * once and detached when the last of them goes — a `session.detach` sent while another feature
   * is still watching would silently stop its screen updating.
   *
   * The detach is not optional: without it, moving between sessions accumulates subscriptions and
   * the screen starts receiving frames for a session it is no longer showing.
   */
  attach(sessionId: string, subscriber: SessionSubscriber): () => void {
    const watching = this.subscribers.get(sessionId) ?? new Set<SessionSubscriber>();
    watching.add(subscriber);
    this.subscribers.set(sessionId, watching);

    if (this.status === 'ready') {
      this.requestAttach(sessionId);
    }

    return () => {
      const remaining = this.subscribers.get(sessionId);
      remaining?.delete(subscriber);

      if (remaining === undefined || remaining.size > 0) {
        return;
      }

      this.subscribers.delete(sessionId);
      if (this.status === 'ready') {
        this.command('session.detach', { sessionId });
      }
    };
  }

  /**
   * Watches events that belong to no attached session. Answers the unsubscribe.
   *
   * A command may **open** the session it is about — the first ping of the walking skeleton does —
   * so the event announcing it arrives before anything could have attached to it.
   */
  observe(listener: (frame: Envelope) => void): () => void {
    this.observers.add(listener);
    return () => this.observers.delete(listener);
  }

  /** Sends a command. Silently queues nothing: a command sent while down is a command lost. */
  command(type: string, payload: Readonly<Record<string, unknown>>): boolean {
    return this.send('command', type, payload);
  }

  /**
   * One outgoing frame, stamped and logged.
   *
   * The envelope fields are filled in here and nowhere else, so nothing that sends a frame can
   * forget one. Positional arguments rather than a draft object, because there are four of them
   * and three are always present.
   */
  private send(
    kind: Envelope['kind'],
    type: string,
    payload: Readonly<Record<string, unknown>>,
    correlationId?: string,
  ): boolean {
    const socket = this.socket;
    if (socket === null || this.status !== 'ready') {
      return false;
    }

    const frame: Envelope = {
      v: PROTOCOL_VERSION,
      id: newTraceId(),
      kind,
      type,
      ts: new Date().toISOString(),
      traceId: newTraceId(),
      ...(correlationId === undefined ? {} : { correlationId }),
      payload,
    };

    logger.debug({ op: 'ws.outbound', kind, type }, 'ws frame sent');
    socket.send(JSON.stringify(frame));
    return true;
  }

  /**
   * Answers a `request` the server is waiting on.
   *
   * A `response` and not a command, because that is what it is: the server asked, `correlationId`
   * names the question, and the kind is what tells the gateway the difference. The one case that
   * exists today is `permission.resolve`, and the agent loop is stopped until it arrives.
   *
   * @returns whether the frame left; a socket that is not ready silently sends nothing
   */
  respond(
    type: string,
    payload: Readonly<Record<string, unknown>>,
    correlationId: string,
  ): boolean {
    return this.send('response', type, payload, correlationId);
  }

  /** The delay before the next attempt: exponential, capped, and jittered. */
  backoffFor(attempt: number): number {
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt - 1));
    return Math.round(BACKOFF_MIN_MS + this.random() * (ceiling - BACKOFF_MIN_MS));
  }

  private handshake(): void {
    const token = this.options.accessToken();
    if (token === null) {
      this.socket?.close(1000, 'not authenticated');
      return;
    }

    const frame: Envelope = {
      v: PROTOCOL_VERSION,
      id: newTraceId(),
      kind: 'command',
      type: 'connection.authenticate',
      ts: new Date().toISOString(),
      payload: {
        token,
        locale: this.options.locale(),
        client: { kind: 'web', version: this.options.appVersion },
      },
    };

    // The token is the one thing that never reaches a log, not even truncated.
    logger.debug({ op: 'ws.outbound', type: frame.type }, 'ws frame sent');
    this.socket?.send(JSON.stringify(frame));
  }

  private receive(raw: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn({ op: 'ws.inbound' }, 'ws frame is not json');
      return;
    }

    // Validated against the guard generated from the JSON Schema — the same contract the backend
    // and the Flutter app read. An unknown field is fine; a missing envelope field is not.
    if (!isEnvelope(parsed)) {
      logger.warn({ op: 'ws.inbound' }, 'ws frame does not match the envelope');
      return;
    }

    logger.debug(
      { op: 'ws.inbound', kind: parsed.kind, type: parsed.type, seq: parsed.seq },
      'ws frame received',
    );

    if (parsed.type === 'connection.ready') {
      this.ready();
      return;
    }

    if (parsed.type === 'session.attached') {
      this.attached(parsed);
      return;
    }

    // An `event` is a fact of the conversation; a `request` is the server asking a question and
    // waiting. Both belong to a session and both go to whoever is watching it.
    if (parsed.kind === 'event' || parsed.kind === 'request') {
      this.deliver(parsed);
    }
  }

  private ready(): void {
    this.attempt = 0;
    this.move('ready');

    // Whatever was being watched before the socket went is watched again, from where it left off.
    for (const sessionId of this.subscribers.keys()) {
      this.requestAttach(sessionId);
    }
  }

  /**
   * Asks for the session again, resuming from the **furthest behind** of its subscribers.
   *
   * The minimum and not the maximum: resuming from the one that is ahead would leave the other
   * with a hole it has no way to notice. Re-delivering what a subscriber already applied costs
   * nothing, because discarding `seq <= lastSeq` is the first rule of every store.
   */
  private requestAttach(sessionId: string): void {
    const applied = [...(this.subscribers.get(sessionId) ?? [])].map((subscriber) =>
      subscriber.lastSeq(),
    );
    const resumeFromSeq = applied.length === 0 ? 0 : Math.min(...applied);

    this.command('session.attach', {
      sessionId,
      ...(resumeFromSeq > 0 ? { resumeFromSeq } : {}),
    });
  }

  private attached(frame: Envelope): void {
    const payload = frame.payload as { sessionId?: unknown; gap?: unknown } | undefined;
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : null;
    const watching = sessionId === null ? undefined : this.subscribers.get(sessionId);

    if (watching === undefined || payload?.gap !== true) {
      return;
    }

    logger.warn({ op: 'ws.connection', sessionId }, 'replay gap — reloading the transcript');

    for (const subscriber of watching) {
      subscriber.onGap();
    }
  }

  private deliver(frame: Envelope): void {
    const sessionId = frame.sessionId;
    const watching = sessionId === undefined ? undefined : this.subscribers.get(sessionId);

    if (watching !== undefined && watching.size > 0) {
      for (const subscriber of watching) {
        subscriber.onEvent(frame);
      }
      return;
    }

    for (const observer of this.observers) {
      observer(frame);
    }
  }

  private dropped(code: number): void {
    this.socket = null;

    if (!this.wanted || code === 1000) {
      this.move('closed');
      return;
    }

    this.attempt += 1;
    const delayMs = this.backoffFor(this.attempt);
    this.move('reconnecting');

    logger.warn(
      { op: 'ws.connection', closeCode: code, attempt: this.attempt, delayMs },
      'ws reconnecting',
    );

    this.cancelRetry = this.schedule(() => {
      this.cancelRetry = null;
      this.connect();
    }, delayMs);
  }

  private move(status: ConnectionStatus): void {
    if (this.status === status) {
      return;
    }

    this.status = status;
    for (const watcher of this.watchers) {
      watcher(status);
    }
  }
}

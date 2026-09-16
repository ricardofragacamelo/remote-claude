import type { Envelope } from '@remote-claude/contracts';

import type { UserId } from '@domain/auth';
import type { Replay } from '@infra/websocket/event-buffer';
import type { EventDraft } from '@infra/websocket/session-hub';

/** What an ack carries back: a `type` from the contract and its payload. */
export interface AckDraft {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** What a command produced: the ack, and whatever has to reach the client after it. */
export interface WsCommandOutcome {
  readonly ack: AckDraft;

  /** Frames delivered to the caller right after the ack — the replay of `session.attach`. */
  readonly then: readonly Envelope[];

  /**
   * Events to fan out, run by the gateway **after** the ack has gone out.
   *
   * A handler that published while it was still running would put its event ahead of the ack of
   * the very command that caused it, and a client would see a result before it was told the
   * command was accepted.
   */
  publish(): void;
}

/** Everything a handler is allowed to know about the connection it is serving. */
export interface WsCommandContext {
  readonly connectionId: string;

  /** Who is asking. A handler never runs before the handshake, so this is never null. */
  readonly userId: UserId;

  readonly locale: string;

  /** The command frame, already validated against the envelope. */
  readonly frame: Envelope;

  /** Subscribes this connection to a session's events. */
  attach(sessionId: string): void;

  /** What a reconnecting client missed, from the replay buffer. */
  replay(sessionId: string, resumeFromSeq: number | null): Replay;

  /**
   * Fans an event out to every connection watching a session.
   *
   * The handler asks for it and the gateway performs it, after the ack has gone out — which is
   * also why a handler needs no transport dependency of its own.
   */
  publish(sessionId: string, event: EventDraft): void;
}

/**
 * One command of the contract.
 *
 * Handlers live in `adapter/inbound/ws/<domain>/` and the gateway only routes to them: it
 * authenticates, validates the frame, finds the handler and calls the use case. A branch of
 * business logic inside the gateway belongs in `application/` or `domain/`.
 */
export interface WsCommandHandler {
  /** The `type` of the contract this handler answers. */
  readonly type: string;

  handle(context: WsCommandContext): Promise<WsCommandOutcome>;
}

/** DI token of the handler list the gateway routes over. */
export const WS_COMMAND_HANDLERS = Symbol('WsCommandHandlers');

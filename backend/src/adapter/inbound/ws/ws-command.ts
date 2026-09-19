import type { Envelope } from '@remote-claude/contracts';

import type { UserId } from '@domain/auth';
import type { Replay } from '@infra/websocket/event-buffer';
import type { EventDraft } from '@infra/websocket/session-hub';

/** What an ack carries back: a `type` from the contract and its payload. */
export interface AckDraft {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * The generic ack, naming the command it accepted.
 *
 * Every command that has no ack of its own answers this one, so it is written here rather than
 * once per handler: the same three lines in every file is how the shape of an ack starts to differ
 * between two of them.
 *
 * It says **accepted**, never finished — the outcome arrives as an event.
 */
export function accepted(type: string): AckDraft {
  return { type: 'command.accepted', payload: { command: type } };
}

/**
 * The correlation fields an event caused by a command carries.
 *
 * Written once rather than spread by hand in every handler: the `traceId` is conditional, and a
 * handler that forgot the condition would put an explicit `undefined` on the wire.
 */
export function causedBy(context: WsCommandContext): {
  readonly correlationId: string;
  readonly traceId?: string;
} {
  return {
    correlationId: context.frame.id,
    ...(context.frame.traceId === undefined ? {} : { traceId: context.frame.traceId }),
  };
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

  /**
   * Changes the language of **this connection**, not of the user.
   *
   * A phone in Portuguese and a browser in English watch the same session at the same time, so the
   * language is a property of the socket. It lives on the context rather than in a use case
   * because nothing about it is a business rule: no row is read and none is written.
   */
  setLocale(locale: string): void;

  /** The command frame, already validated against the envelope. */
  readonly frame: Envelope;

  /** Subscribes this connection to a session's events. */
  attach(sessionId: string): void;

  /**
   * Stops this connection from receiving a session's events.
   *
   * Idempotent on purpose: detaching from something this connection was never attached to is the
   * normal outcome of a reconnect racing a screen change, and answering an error there would make
   * every client carry bookkeeping the server already has.
   */
  detach(sessionId: string): void;

  /**
   * Whether this connection is watching a session.
   *
   * It is a fact about a **socket**, which is why it reaches a use case as an argument rather than
   * being looked up: `application/` has no sockets, and a port that let it ask one would be a port
   * that exists to smuggle the transport inwards.
   */
  isAttached(sessionId: string): boolean;

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

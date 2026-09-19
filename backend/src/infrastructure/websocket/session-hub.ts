import { Inject, Injectable } from '@nestjs/common';
import type { Envelope } from '@remote-claude/contracts';

import { LOGGER, type Logger } from '@shared/logging/logger';
import { forLog } from '@shared/logging/redact';
import { ConnectionRegistry } from './connection-registry';
import type { Connection } from './connection-registry';
import { EventBuffer } from './event-buffer';
import type { Replay } from './event-buffer';
import { FrameBuilder } from './frame-builder';
import type { FrameDraft } from './frame-builder';

/** What a caller asks the hub to publish. `seq` is the hub's to fill in, so it is absent here. */
export type EventDraft = Omit<FrameDraft, 'kind' | 'seq'>;

/**
 * Fan-out: one session, many connections.
 *
 * Two things live here and nowhere else.
 *
 * **`seq` is assigned in one place.** Two things numbering the same stream is a replay that
 * silently skips or repeats, and the client has no way to tell which.
 *
 * **Publication is fire-and-forget per connection.** A slow or dead socket must not hold the
 * producer — it is removed and logged, and it reconnects and replays.
 */
@Injectable()
export class SessionHub {
  private readonly sequences = new Map<string, number>();

  constructor(
    @Inject(ConnectionRegistry) private readonly registry: ConnectionRegistry,
    @Inject(EventBuffer) private readonly buffer: EventBuffer,
    @Inject(FrameBuilder) private readonly frames: FrameBuilder,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** The next sequence of a session. Strictly monotonic, and never handed out twice. */
  private nextSeq(sessionId: string): number {
    const next = (this.sequences.get(sessionId) ?? 0) + 1;
    this.sequences.set(sessionId, next);
    return next;
  }

  /**
   * Numbers an event, keeps it for replay, and sends it to every connection watching.
   *
   * @returns the frame as it went out, so the caller can log or assert on the `seq` it got
   */
  publish(sessionId: string, draft: EventDraft): Envelope {
    const frame = this.frames.build({
      ...draft,
      kind: 'event',
      sessionId,
      seq: this.nextSeq(sessionId),
    });

    this.buffer.append(sessionId, frame);

    return this.fanOut(sessionId, frame);
  }

  /**
   * Puts an open question to every connection watching a session.
   *
   * Deliberately **not** numbered and **not** buffered, which is what separates a question from a
   * fact. A `seq` would claim a place in the history of the conversation for something that has
   * not happened yet, and replaying it later would put a card back on screen for a request that
   * has since been answered. A reconnecting client is told about the questions that are still open
   * by the permission registry, which is the only thing that knows which ones those are
   * ([ADR-012](../../../../docs/architecture/shared/00-decisions.md)).
   */
  request(sessionId: string, draft: EventDraft): Envelope {
    return this.fanOut(sessionId, this.frames.build({ ...draft, kind: 'request', sessionId }));
  }

  /**
   * One frame to every connection watching a session.
   *
   * The one place the fan-out happens, so what differs between a question and a fact stays the
   * two lines that actually differ — whether it is numbered, and whether it is kept.
   *
   * @returns the frame as it went out, so the caller can log or assert on the `seq` it got
   */
  private fanOut(sessionId: string, frame: Envelope): Envelope {
    for (const connection of this.registry.forSession(sessionId)) {
      this.deliver(connection, frame);
    }

    return frame;
  }

  /** Sends one frame to one connection, logging the outbound edge. */
  deliver(connection: Connection, frame: Envelope): void {
    const logged = forLog(frame.payload);

    try {
      connection.socket.send(JSON.stringify(frame));
      this.logger.debug(
        {
          op: 'ws.outbound',
          layer: 'infrastructure',
          connectionId: connection.id,
          kind: frame.kind,
          type: frame.type,
          ...(frame.seq === undefined ? {} : { seq: frame.seq }),
          payload: logged.payload,
          truncated: logged.truncated,
        },
        'ws frame sent',
      );
    } catch (error) {
      // A failed send drops the connection instead of propagating: the producer of the stream is
      // not allowed to stall because one subscriber went away.
      this.logger.warn(
        { op: 'ws.outbound', layer: 'infrastructure', connectionId: connection.id, err: error },
        'dropping connection after a failed send',
      );
      this.registry.remove(connection.id);
    }
  }

  /**
   * Fans a failure out to everybody watching a session.
   *
   * Deliberately **not** an event: it carries no `seq` and it is not kept for replay. It says
   * "something is wrong right now", and replaying that ten minutes later to a reconnecting client
   * would report a failure that has already been dealt with. What does belong in the history is
   * the consequence — a session that ends because of it closes with a reason, as an event.
   */
  publishError(sessionId: string, error: unknown, traceId: string): void {
    const frame = this.frames.error(error, traceId);

    for (const connection of this.registry.forSession(sessionId)) {
      this.deliver(connection, frame);
    }
  }

  /** What a reconnecting client missed, from the ring buffer. */
  replay(sessionId: string, resumeFromSeq: number | null): Replay {
    return this.buffer.since(sessionId, resumeFromSeq);
  }
}

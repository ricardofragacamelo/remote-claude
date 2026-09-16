import type { Envelope } from '@remote-claude/contracts';

import { WS_LIMITS } from './limits';

/** What a client gets back when it asks to resume from a sequence. */
export interface Replay {
  readonly events: readonly Envelope[];
  readonly oldestAvailableSeq: number;
  readonly gap: boolean;
}

/**
 * The last N events of each session, in memory.
 *
 * Volatile by design: it dies with the process, and a restart means `gap: true` for everyone. That
 * is acceptable because the durable transcript is the source of truth — and a buffer that tried to
 * survive would be a second one. See docs/architecture/backend/06-realtime.md.
 */
export class EventBuffer {
  private readonly bySession = new Map<string, Envelope[]>();

  constructor(private readonly capacity: number = WS_LIMITS.replayBufferSize) {}

  /** Keeps an event, dropping the oldest once the ring is full. */
  append(sessionId: string, event: Envelope): void {
    const events = this.bySession.get(sessionId) ?? [];
    events.push(event);

    if (events.length > this.capacity) {
      events.splice(0, events.length - this.capacity);
    }

    this.bySession.set(sessionId, events);
  }

  /**
   * What the client missed.
   *
   * A `resumeFromSeq` older than the buffer answers `gap: true` and no events: a partial hole is
   * never stitched, because a client that believes it has everything and does not is worse than
   * one that knows it has to reload.
   */
  since(sessionId: string, resumeFromSeq: number | null): Replay {
    const events = this.bySession.get(sessionId) ?? [];
    const oldestAvailableSeq = events[0]?.seq ?? 0;

    if (resumeFromSeq === null) {
      return { events: [], oldestAvailableSeq, gap: false };
    }

    if (events.length > 0 && resumeFromSeq < oldestAvailableSeq - 1) {
      return { events: [], oldestAvailableSeq, gap: true };
    }

    return {
      events: events.filter((event) => (event.seq ?? 0) > resumeFromSeq),
      oldestAvailableSeq,
      gap: false,
    };
  }

  /** Drops everything kept for a session. */
  forget(sessionId: string): void {
    this.bySession.delete(sessionId);
  }
}

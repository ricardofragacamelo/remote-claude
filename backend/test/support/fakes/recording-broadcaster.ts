import type { SessionBroadcaster, SessionEvent } from '@application/session';
import type { SessionId } from '@domain/session';

/**
 * The broadcaster, writing into arrays.
 *
 * One fake rather than an object literal per spec: a method added to `SessionBroadcaster` would
 * otherwise be a compile error in as many files as there are specs, and each would grow its own
 * slightly different stub.
 */
export class RecordingBroadcaster implements SessionBroadcaster {
  readonly events: { sessionId: string; event: SessionEvent }[] = [];
  readonly errors: { sessionId: string; error: unknown }[] = [];

  publish(sessionId: SessionId, event: SessionEvent): void {
    this.events.push({ sessionId: sessionId.value, event });
  }

  publishError(sessionId: SessionId, error: unknown): void {
    this.errors.push({ sessionId: sessionId.value, error });
  }

  /** The types published, in order — what most assertions actually want. */
  get types(): string[] {
    return this.events.map((entry) => entry.event.type);
  }
}

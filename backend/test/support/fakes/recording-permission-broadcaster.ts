import type { PermissionBroadcaster, PermissionFrame } from '@application/permission';
import type { SessionId } from '@domain/session';

/** One frame the permission module put on the wire, and which channel it used. */
export interface RecordedPermissionFrame {
  readonly sessionId: string;
  readonly kind: 'request' | 'event';
  readonly frame: PermissionFrame;
}

/**
 * The permission broadcaster, writing into an array.
 *
 * It keeps the **channel** as well as the frame, because the difference between the two is a rule
 * rather than a detail: a question is a `request` that is never buffered, and a fact is an event
 * that is. A fake that flattened them would let a test pass while a question was being replayed.
 */
export class RecordingPermissionBroadcaster implements PermissionBroadcaster {
  readonly frames: RecordedPermissionFrame[] = [];

  request(sessionId: SessionId, frame: PermissionFrame): void {
    this.frames.push({ sessionId: sessionId.value, kind: 'request', frame });
  }

  publish(sessionId: SessionId, frame: PermissionFrame): void {
    this.frames.push({ sessionId: sessionId.value, kind: 'event', frame });
  }

  /** The types published, in order — what most assertions actually want. */
  get types(): string[] {
    return this.frames.map((entry) => entry.frame.type);
  }

  /** The payload of the last frame of a type, for an assertion about what a client would see. */
  last(type: string): Readonly<Record<string, unknown>> | null {
    return this.frames.findLast((entry) => entry.frame.type === type)?.frame.payload ?? null;
  }
}

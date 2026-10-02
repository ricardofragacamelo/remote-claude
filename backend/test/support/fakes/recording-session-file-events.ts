import type { SessionFileEvents } from '@application/session';
import type { SessionFileStateRecorded } from '@application/shared';

/** The session's file facts, kept in order, so a test can say what was published. */
export class RecordingSessionFileEvents implements SessionFileEvents {
  readonly recorded: SessionFileStateRecorded[] = [];

  fileStateRecorded(event: SessionFileStateRecorded): void {
    this.recorded.push(event);
  }
}

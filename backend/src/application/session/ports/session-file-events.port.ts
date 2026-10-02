import type { SessionFileStateRecorded } from '@application/shared';

/**
 * What the session tells the rest of the backend about the files it writes.
 *
 * One fact for now: how a write of Claude's left a file, which `files` listens to so it can tell a
 * change of Claude's from the person's or somebody else's — without either module importing the
 * other (plan 07, B-18). **Publishing never throws**: nothing a listener does may reach the hook
 * that published, which runs inside a turn of Claude.
 */
export interface SessionFileEvents {
  fileStateRecorded(event: SessionFileStateRecorded): void;
}

export const SESSION_FILE_EVENTS = Symbol('SessionFileEvents');

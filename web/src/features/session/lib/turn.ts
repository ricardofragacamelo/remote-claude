import type { SessionStatus } from '../types/live-session';

/** The states in which a turn is running — what stop and `Esc` interrupt (plan 08, B-40). */
const TURN_RUNNING: ReadonlySet<SessionStatus> = new Set([
  'thinking',
  'running',
  'waitingPermission',
]);

/** Whether a turn is running: thinking, running a tool, or waiting on a person. */
export function isTurnRunning(status: SessionStatus): boolean {
  return TURN_RUNNING.has(status);
}

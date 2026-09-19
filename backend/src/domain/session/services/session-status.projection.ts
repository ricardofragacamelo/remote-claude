import type { SessionStatus } from '../value-objects/session-status.value-object';

/**
 * Which status each event of our contract implies.
 *
 * The status is **derived by us**, not read off a single SDK message — there is no field in the
 * stream that says "waiting on a human". Keeping the derivation here, as a table, is what stops
 * the same inference from being made slightly differently in the runner, in the gateway and in
 * the client. See docs/architecture/backend/04-claude-integration.md.
 *
 * An event that is not in the table leaves the status alone: most of the stream is content, and a
 * default of "unknown" would make the UI flicker on every delta.
 */
const STATUS_BY_EVENT: Readonly<Record<string, SessionStatus>> = {
  'session.started': 'idle',
  'message.delta': 'thinking',
  'message.completed': 'thinking',
  'tool.started': 'running',
  'tool.progress': 'running',
  'tool.completed': 'running',
  // The agent loop is blocked on a person. This is the one the UI cannot afford to confuse with
  // `running`: a spinner for something that will never finish on its own.
  'permission.requested': 'waitingPermission',
  'permission.resolved': 'running',
  'turn.completed': 'idle',
  'session.closed': 'closed',
};

/** The status `eventType` implies, or `null` when it implies nothing. */
export function statusFor(eventType: string): SessionStatus | null {
  return STATUS_BY_EVENT[eventType] ?? null;
}

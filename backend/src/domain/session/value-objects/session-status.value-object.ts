/**
 * Where a session stands.
 *
 * `waitingPermission` is the one that matters: the agent loop is **blocked** on a human, and a UI
 * that cannot tell it apart from `running` shows a spinner for something that will never finish on
 * its own. See docs/architecture/backend/03-modules.md#session.
 */
export const SESSION_STATUSES = [
  'starting',
  'idle',
  'thinking',
  'running',
  'waitingPermission',
  'closed',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * Every transition the machine allows.
 *
 * Written as data rather than as a chain of `if`s: the allowed set is the specification, and a
 * table can be read against the diagram in one pass. `closed` is terminal and has no row — a
 * session whose subprocess is gone never comes back, and pretending otherwise would leave a
 * runner that is not there.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  // A session that fails while starting goes straight to `closed`; it never had a turn.
  starting: ['idle', 'closed'],
  idle: ['thinking', 'closed'],
  // `thinking` is the model producing text; `running` is a tool executing. The loop moves between
  // them many times in one turn, which is why they reach each other in both directions.
  thinking: ['running', 'waitingPermission', 'idle', 'closed'],
  running: ['thinking', 'waitingPermission', 'idle', 'closed'],
  // Whatever the human answers, the loop resumes — an `allow` runs the tool, a `deny` sends the
  // refusal back to the model. Both are the session carrying on.
  waitingPermission: ['running', 'thinking', 'idle', 'closed'],
  closed: [],
};

/** Whether the machine may move from `from` to `to`. Staying put is never a transition. */
export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

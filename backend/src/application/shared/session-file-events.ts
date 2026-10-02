/**
 * The name on the internal bus of "a session of Claude finished writing a file, and this is how it
 * left it". `<module>.<fact in the past>`, like every event on the bus.
 */
export const SESSION_FILE_STATE_RECORDED = 'session.fileStateRecorded';

/**
 * What a session's `PostToolUse` hook learned about a file it wrote.
 *
 * The contract between `session`, which publishes it, and `files`, which tells the person's writes
 * from Claude's by it (plan 07, B-18 and B-22). It lives here because neither module may import the
 * other: `files` never depends on `session` — the arrow would close a cycle through `workspace` —
 * and a fact both sides agree on is shared vocabulary, not a module
 * (docs/architecture/backend/03-modules.md#comunicação-assíncrona).
 */
export interface SessionFileStateRecorded {
  /** The real path the session wrote. */
  readonly path: string;
  /** SHA-256 in hex of what the session left there. */
  readonly hash: string;
  readonly at: Date;
}

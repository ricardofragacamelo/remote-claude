import type { SessionId } from '@domain/session';

/**
 * What the session did to the disk, and what the disk looked like before.
 *
 * One port for both halves because they are one mechanism: a hook writes the *before*, another
 * writes the *after*, and undo needs both to tell "the session left it like this" from "somebody
 * edited it afterwards". See docs/architecture/backend/04-claude-integration.md#desfazer-arquivos.
 *
 * **Nothing here may block a tool.** That is the difference from the audit trail, and it is a
 * deliberate asymmetry: without a trail there is no authorisation, but without a baseline undo is
 * only more conservative — and degrading to "more conservative" is acceptable in a way that
 * degrading to "no record" is not.
 */
export interface SessionFileJournal {
  /**
   * Opens the checkpoint of a turn.
   *
   * The prompt text is stored because it is the label of the undo point in the UI: "revert the
   * turn where I asked it to refactor the parser" is a sentence a person can act on.
   */
  openTurn(sessionId: SessionId, promptId: string, promptText: string): Promise<void>;

  /**
   * Snapshots what a path held before this turn touched it.
   *
   * Only the **first** touch of a turn writes anything; a later one is a no-op. The second would
   * replace the state at the start of the turn with an intermediate one, and the start of the turn
   * is what the undo point means.
   */
  captureBefore(sessionId: SessionId, promptId: string, path: string): Promise<void>;

  /** Records how the session left a path, after a write that succeeded. */
  recordResult(sessionId: SessionId, path: string): Promise<void>;
}

export const SESSION_FILE_JOURNAL = Symbol('SessionFileJournal');

import type { Session, SessionId } from '@domain/session';

/**
 * How a session is stored and read back.
 *
 * It answers entities, never rows: the table and the entity change for different reasons, and a
 * repository that leaks rows welds them together. See docs/architecture/backend/05-persistence.md.
 */
export interface SessionRepository {
  /** The session, or `null` when there is none with that id. */
  findById(id: SessionId): Promise<Session | null>;

  /** Inserts or updates. Saving the same session twice updates it; it never duplicates a row. */
  save(session: Session): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('SessionRepository');

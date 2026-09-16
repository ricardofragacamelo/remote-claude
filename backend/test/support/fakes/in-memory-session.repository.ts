import type { SessionRepository } from '@application/session';
import type { Session, SessionId } from '@domain/session';

/**
 * A stand-in for the repository.
 *
 * A fake and not a mock: it verifies **what** happened — the session is there afterwards — rather
 * than *how*, which is what makes it survive a refactor. See docs/architecture/backend/07-testing.md.
 */
export class InMemorySessionRepository implements SessionRepository {
  readonly saved: Session[] = [];
  private readonly store = new Map<string, Session>();

  /** Seeds a session, as if it had been saved earlier. */
  seed(session: Session): void {
    this.store.set(session.id.value, session);
  }

  findById(id: SessionId): Promise<Session | null> {
    return Promise.resolve(this.store.get(id.value) ?? null);
  }

  save(session: Session): Promise<void> {
    this.saved.push(session);
    this.store.set(session.id.value, session);
    return Promise.resolve();
  }
}

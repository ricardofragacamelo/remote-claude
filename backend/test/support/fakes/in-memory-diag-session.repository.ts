import type { DiagSessionRepository } from '@application/diag';
import type { DiagSession } from '@domain/diag';
import type { SessionId } from '@domain/session';

/**
 * A stand-in for the repository.
 *
 * A fake and not a mock: it verifies **what** happened — the session is there afterwards — rather
 * than *how*, which is what makes it survive a refactor. See docs/architecture/backend/07-testing.md.
 */
export class InMemoryDiagSessionRepository implements DiagSessionRepository {
  readonly saved: DiagSession[] = [];
  private readonly store = new Map<string, DiagSession>();

  /** Seeds a session, as if it had been saved earlier. */
  seed(session: DiagSession): void {
    this.store.set(session.id.value, session);
  }

  findById(id: SessionId): Promise<DiagSession | null> {
    return Promise.resolve(this.store.get(id.value) ?? null);
  }

  save(session: DiagSession): Promise<void> {
    this.saved.push(session);
    this.store.set(session.id.value, session);
    return Promise.resolve();
  }
}

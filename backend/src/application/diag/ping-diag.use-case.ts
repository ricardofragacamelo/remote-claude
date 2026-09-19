import type { Clock, IdGenerator } from '@domain/shared';
import type { Pong } from '@domain/diag';
import { DiagSession } from '@domain/diag';
import { SessionForbiddenError, SessionId, SessionNotFoundError } from '@domain/session';
import type { UserId } from '@domain/auth';
import type { PingDiagCommand } from './commands/ping-diag.command';
import type { DiagSessionRepository } from './ports/diag-session.repository';

/**
 * The vertical slice: it orchestrates, and owns no rule of its own.
 *
 * Constructed with `new` and plain interfaces, with no decorator anywhere — which is what lets
 * the unit test be `new PingDiagUseCase(fakeRepo, fixedClock, fixedIds)` instead of a Nest
 * testing module. See docs/architecture/backend/01-clean-architecture.md.
 */
export class PingDiagUseCase {
  constructor(
    private readonly sessions: DiagSessionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * @throws {import('../../domain/session').InvalidSessionIdError} when `sessionId` is not a ULID
   * @throws {SessionNotFoundError} when it is well formed and there is no such session
   * @throws {SessionForbiddenError} when there is one, and it is somebody else's
   */
  async execute(command: PingDiagCommand): Promise<Pong> {
    const session =
      command.sessionId === null
        ? DiagSession.open(SessionId.create(this.ids.next()), command.userId, this.clock.now())
        : await this.load(SessionId.create(command.sessionId), command.userId);

    const pong = session.ping(this.clock.now(), command.nonce);
    await this.sessions.save(session);

    return pong;
  }

  private async load(id: SessionId, userId: UserId): Promise<DiagSession> {
    const found = await this.sessions.findById(id);

    // Two facts, two answers: `404` for a session that is not there, `403` for one that is and
    // is somebody else's ([D-17](../../../../docs/plans/01-live-session/decisions.md)).
    if (found === null) {
      throw new SessionNotFoundError(id.value);
    }

    if (!found.isOwnedBy(userId)) {
      throw new SessionForbiddenError(id.value);
    }

    return found;
  }
}

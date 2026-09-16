import type { Clock, IdGenerator } from '@domain/shared';
import type { Pong } from '@domain/session';
import { Session, SessionId, SessionNotFoundError } from '@domain/session';
import type { UserId } from '@domain/auth';
import type { PingSessionCommand } from './commands/ping-session.command';
import type { SessionRepository } from './ports/session.repository';

/**
 * The vertical slice: it orchestrates, and owns no rule of its own.
 *
 * Constructed with `new` and plain interfaces, with no decorator anywhere — which is what lets
 * the unit test be `new PingSessionUseCase(fakeRepo, fixedClock, fixedIds)` instead of a Nest
 * testing module. See docs/architecture/backend/01-clean-architecture.md.
 */
export class PingSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * @throws {import('../../domain/session').InvalidSessionIdError} when `sessionId` is not a ULID
   * @throws {SessionNotFoundError} when it is well formed but unknown, or owned by someone else
   */
  async execute(command: PingSessionCommand): Promise<Pong> {
    const session =
      command.sessionId === null
        ? Session.open(SessionId.create(this.ids.next()), command.userId, this.clock.now())
        : await this.load(SessionId.create(command.sessionId), command.userId);

    const pong = session.ping(this.clock.now(), command.nonce);
    await this.sessions.save(session);

    return pong;
  }

  private async load(id: SessionId, userId: UserId): Promise<Session> {
    const found = await this.sessions.findById(id);

    // Someone else's session answers exactly like a missing one. Telling the caller that it
    // exists but is not theirs confirms its existence to whoever is probing for ids.
    if (found === null || !found.isOwnedBy(userId)) {
      throw new SessionNotFoundError(id.value);
    }

    return found;
  }
}

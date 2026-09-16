import { beforeEach, describe, expect, it } from 'vitest';

import { PingSessionUseCase } from '@application/session';
import { UserId } from '@domain/auth';
import { InvalidSessionIdError, SessionNotFoundError } from '@domain/session';
import { aSession } from '../../../support/builders/session.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemorySessionRepository } from '../../../support/fakes/in-memory-session.repository';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const now = new Date('2026-09-13T12:00:00.000Z');

describe('PingSessionUseCase', () => {
  let sessions: InMemorySessionRepository;
  let clock: FixedClock;
  let ids: SequentialIds;
  let useCase: PingSessionUseCase;

  beforeEach(() => {
    sessions = new InMemorySessionRepository();
    clock = new FixedClock(now);
    ids = new SequentialIds();

    // No container, no decorator, no testing module: this is the point of `application/` not
    // importing @nestjs/*.
    useCase = new PingSessionUseCase(sessions, clock, ids);
  });

  it('opens a session when none is named, and answers the first pong', async () => {
    const pong = await useCase.execute({ sessionId: null, nonce: 'n', userId: owner });

    expect(pong.pingCount).toBe(1);
    expect(pong.pingedAt).toEqual(now);
    expect(pong.nonce).toBe('n');
    expect(ids.count).toBe(1);
  });

  it('persists the session it opened', async () => {
    const pong = await useCase.execute({ sessionId: null, nonce: 'n', userId: owner });

    expect(sessions.saved).toHaveLength(1);
    expect(await sessions.findById(pong.sessionId)).not.toBeNull();
  });

  it('reads the instant from the clock, never from the wall clock', async () => {
    clock.set(new Date('2030-01-01T00:00:00.000Z'));

    const pong = await useCase.execute({ sessionId: null, nonce: 'n', userId: owner });

    expect(pong.pingedAt).toEqual(new Date('2030-01-01T00:00:00.000Z'));
  });

  it('counts a second ping on the session it is given', async () => {
    sessions.seed(aSession({ pingCount: 4 }));

    const pong = await useCase.execute({
      sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
      nonce: 'n',
      userId: owner,
    });

    expect(pong.pingCount).toBe(5);
  });

  it('persists the updated count instead of inserting a second session', async () => {
    sessions.seed(aSession({ pingCount: 1 }));

    await useCase.execute({ sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ', nonce: 'n', userId: owner });
    await useCase.execute({ sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ', nonce: 'n', userId: owner });

    expect(sessions.saved).toHaveLength(2);
    expect(sessions.saved[1]?.pingCount).toBe(3);
  });

  it('refuses a session id that is not a ULID, without touching the repository', async () => {
    await expect(
      useCase.execute({ sessionId: 'not-a-ulid', nonce: 'n', userId: owner }),
    ).rejects.toThrow(InvalidSessionIdError);

    expect(sessions.saved).toHaveLength(0);
  });

  it('refuses a session that does not exist', async () => {
    await expect(
      useCase.execute({ sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ', nonce: 'n', userId: owner }),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it("answers `not found` for somebody else's session, never `forbidden`", async () => {
    sessions.seed(aSession({ ownerId: 'auth|somebody-else' }));

    await expect(
      useCase.execute({ sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ', nonce: 'n', userId: owner }),
    ).rejects.toThrow(SessionNotFoundError);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import { AttachSessionUseCase } from '@application/session';
import { UserId } from '@domain/auth';
import { InvalidSessionIdError, SessionNotFoundError } from '@domain/session';
import { aSession } from '../../../support/builders/session.builder';
import { InMemorySessionRepository } from '../../../support/fakes/in-memory-session.repository';

const owner = UserId.create('auth|owner');

describe('AttachSessionUseCase', () => {
  let sessions: InMemorySessionRepository;
  let useCase: AttachSessionUseCase;

  beforeEach(() => {
    sessions = new InMemorySessionRepository();
    useCase = new AttachSessionUseCase(sessions);
  });

  it('authorises the owner to watch their own session', async () => {
    sessions.seed(aSession());

    const id = await useCase.execute('01J0ABCDEFGHJKMNPQRSTVWXYZ', owner);

    expect(id.value).toBe('01J0ABCDEFGHJKMNPQRSTVWXYZ');
  });

  it('refuses an identifier that is not a ULID', async () => {
    await expect(useCase.execute('nope', owner)).rejects.toThrow(InvalidSessionIdError);
  });

  it('refuses an unknown session', async () => {
    await expect(useCase.execute('01J0ABCDEFGHJKMNPQRSTVWXYZ', owner)).rejects.toThrow(
      SessionNotFoundError,
    );
  });

  it("refuses somebody else's session with the same answer as an unknown one", async () => {
    sessions.seed(aSession({ ownerId: 'auth|somebody-else' }));

    await expect(useCase.execute('01J0ABCDEFGHJKMNPQRSTVWXYZ', owner)).rejects.toThrow(
      SessionNotFoundError,
    );
  });
});

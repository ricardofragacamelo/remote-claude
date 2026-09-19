import { describe, expect, it } from 'vitest';

import { DiagSessionOwnership } from '@adapter/outbound/diag/diag-session.ownership';
import { RegistrySessionOwnership } from '@adapter/outbound/session/registry-session.ownership';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { aDiagSession } from '../../../../support/builders/diag-session.builder';
import { aRegistry, aSession, SESSION_ID } from '../../../../support/builders/session.builder';
import { InMemoryDiagSessionRepository } from '../../../../support/fakes/in-memory-diag-session.repository';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const sessionId = SessionId.create(SESSION_ID);

/**
 * Who may attach to what.
 *
 * Two kinds of session answer the same question, about different things: one is a subprocess held
 * in memory, the other a row that outlives the process. Both are attachable by whoever owns them,
 * and neither by anybody else.
 */
describe('RegistrySessionOwnership', () => {
  const ownership = (sessions = [aSession()]): RegistrySessionOwnership =>
    new RegistrySessionOwnership(aRegistry(sessions).registry);

  it('owns a running session of its owner', async () => {
    expect(await ownership().access(sessionId, owner)).toBe('owned');
  });

  it('reports a session of somebody else as theirs, not as absent', async () => {
    // The two are different facts and get different statuses: this one is `403`.
    const theirs = [aSession({ ownerId: 'auth|somebody-else' })];

    expect(await ownership(theirs).access(sessionId, owner)).toBe('notOwned');
  });

  it('says nothing about a session that is not running', async () => {
    // Nothing persists a live session, so "over" and "never existed" are one answer — and it is
    // `unknown`, not `notOwned`: this source does not hold that id, and another might.
    expect(await ownership([]).access(sessionId, owner)).toBe('unknown');
  });
});

describe('DiagSessionOwnership', () => {
  const ownership = (
    seed: readonly ReturnType<typeof aDiagSession>[] = [aDiagSession()],
  ): DiagSessionOwnership => {
    const sessions = new InMemoryDiagSessionRepository();
    for (const session of seed) {
      sessions.seed(session);
    }

    return new DiagSessionOwnership(sessions);
  };

  it('owns a diagnostic session of its owner', async () => {
    expect(await ownership().access(sessionId, owner)).toBe('owned');
  });

  it('reports one that belongs to somebody else as theirs', async () => {
    const theirs = [aDiagSession({ ownerId: 'auth|other' })];

    expect(await ownership(theirs).access(sessionId, owner)).toBe('notOwned');
  });

  it('says nothing about a session nobody ever opened', async () => {
    expect(await ownership([]).access(sessionId, stranger)).toBe('unknown');
  });
});

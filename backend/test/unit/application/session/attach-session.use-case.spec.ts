import { describe, expect, it } from 'vitest';

import { AttachSessionUseCase } from '@application/session';
import type { SessionOwnership } from '@application/session';
import { UserId } from '@domain/auth';
import {
  InvalidSessionIdError,
  SessionForbiddenError,
  SessionNotFoundError,
} from '@domain/session';
import { aConversation, SESSION_ID } from '../../../support/builders/session.builder';

const owner = UserId.create('auth|owner');

/**
 * A source that holds exactly the ids it was given, for exactly the user it was given.
 *
 * It answers `unknown` for an id it does not hold — not `notOwned` — because that is the honest
 * difference: another source may hold it, and only the one that does decides whose it is.
 */
function owning(ids: readonly string[], subject = 'auth|owner'): SessionOwnership {
  return {
    access: (sessionId, userId) => {
      if (!ids.includes(sessionId.value)) {
        return Promise.resolve('unknown');
      }

      return Promise.resolve(userId.value === subject ? 'owned' : 'notOwned');
    },
  };
}

/** No stream is a conversation — the diagnostic round trip. */
const noConversations = { conversationOf: () => null };

describe('AttachSessionUseCase', () => {
  it('says which conversation the stream is, for the reload a gap asks for — plan 04, B-07', async () => {
    const conversation = aConversation();
    const attach = new AttachSessionUseCase([owning([SESSION_ID])], {
      conversationOf: (sessionId) => (sessionId.value === SESSION_ID ? conversation : null),
    });

    expect((await attach.execute(SESSION_ID, owner)).conversation).toBe(conversation);
  });

  it('answers no conversation for a stream that is not one', async () => {
    const attach = new AttachSessionUseCase([owning([SESSION_ID])], noConversations);

    expect((await attach.execute(SESSION_ID, owner)).conversation).toBeNull();
  });

  it('authorises a session the first source owns', async () => {
    const attach = new AttachSessionUseCase([owning([SESSION_ID])], noConversations);

    expect((await attach.execute(SESSION_ID, owner)).sessionId.value).toBe(SESSION_ID);
  });

  it('authorises a session only the second source owns', async () => {
    // A live session of Claude and the diagnostic round trip are different things that both
    // produce a stream, and both are attachable by whoever owns them.
    const attach = new AttachSessionUseCase([owning([]), owning([SESSION_ID])], noConversations);

    expect((await attach.execute(SESSION_ID, owner)).sessionId.value).toBe(SESSION_ID);
  });

  it('stops at the first source that says yes', async () => {
    const asked: string[] = [];
    const record = (name: string): SessionOwnership => ({
      access: () => {
        asked.push(name);
        return Promise.resolve('owned');
      },
    });

    await new AttachSessionUseCase([record('first'), record('second')], noConversations).execute(
      SESSION_ID,
      owner,
    );

    expect(asked).toEqual(['first']);
  });

  it('refuses an identifier that is not a ULID, before asking anybody', async () => {
    await expect(
      new AttachSessionUseCase([owning([SESSION_ID])], noConversations).execute('nope', owner),
    ).rejects.toThrow(InvalidSessionIdError);
  });

  it('refuses a session no source has heard of', async () => {
    await expect(
      new AttachSessionUseCase([owning([]), owning([])], noConversations).execute(
        SESSION_ID,
        owner,
      ),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it("refuses somebody else's session as forbidden, not as absent", async () => {
    // Two different facts, two different statuses: `403` says "stop asking", `404` says "it is
    // not there". A client that cannot tell them apart cannot act on either.
    const attach = new AttachSessionUseCase(
      [owning([SESSION_ID], 'auth|somebody-else')],
      noConversations,
    );

    await expect(attach.execute(SESSION_ID, owner)).rejects.toThrow(SessionForbiddenError);
  });

  it('prefers the source that holds the session over the ones that do not', async () => {
    // Order must not decide the answer: a source with nothing to say about an id says `unknown`,
    // and the one that holds it is what makes the refusal `403`.
    const attach = new AttachSessionUseCase(
      [owning([]), owning([SESSION_ID], 'auth|somebody-else')],
      noConversations,
    );

    await expect(attach.execute(SESSION_ID, owner)).rejects.toThrow(SessionForbiddenError);
  });

  it('refuses everything when it was given no source at all', async () => {
    await expect(
      new AttachSessionUseCase([], noConversations).execute(SESSION_ID, owner),
    ).rejects.toThrow(SessionNotFoundError);
  });
});

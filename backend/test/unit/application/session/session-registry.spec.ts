import { describe, expect, it } from 'vitest';

import { SessionRegistry } from '@application/session';
import { UserId } from '@domain/auth';
import {
  SessionForbiddenError,
  SessionId,
  SessionLimitReachedError,
  SessionNotFoundError,
} from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import {
  aConversation,
  aSession,
  CONVERSATION_ID,
  RecordingHandle,
  SESSION_ID,
  aClock,
} from '../../../support/builders/session.builder';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const id = (raw = SESSION_ID): SessionId => SessionId.create(raw);

/** A registry with the given limit, and a helper that adds one more session to it. */
function build(limit = 10): {
  registry: SessionRegistry;
  add: (
    session?: ReturnType<typeof aSession>,
    conversation?: ReturnType<typeof aConversation>,
  ) => void;
} {
  const registry = new SessionRegistry(limit, aClock());

  return {
    registry,
    add: (session = aSession(), conversation = aConversation()) => {
      registry.add({ session, handle: new RecordingHandle(), conversation });
    },
  };
}

describe('SessionRegistry', () => {
  it('starts empty', () => {
    expect(build().registry.size).toBe(0);
    expect(build().registry.all()).toEqual([]);
  });

  it('finds a session it holds', () => {
    const { registry, add } = build();
    add();

    expect(registry.find(id())?.session.id.value).toBe(SESSION_ID);
  });

  it('answers null for one it does not', () => {
    expect(build().registry.find(id())).toBeNull();
  });

  describe('the limit', () => {
    it('lets a reservation through while there is room', () => {
      expect(() => build(1).registry.reserve()).not.toThrow();
    });

    it('refuses the one beyond the limit', () => {
      const { registry, add } = build(1);
      add();

      expect(() => registry.reserve()).toThrow(SessionLimitReachedError);
    });

    it('counts reservations, so two starts cannot both pass', () => {
      // The refusal happens **before** anything is spawned. Checking the map, awaiting a
      // subprocess and only then inserting would let both see room, and one of them would be the
      // orphan the limit exists to prevent.
      const { registry } = build(1);
      registry.reserve();

      expect(() => registry.reserve()).toThrow(SessionLimitReachedError);
    });

    it('says what the limit was, so the message can name it', () => {
      expect.assertions(2);
      const { registry } = build(3);
      registry.reserve();
      registry.reserve();
      registry.reserve();

      try {
        registry.reserve();
      } catch (error) {
        expect((error as SessionLimitReachedError).code).toBe('SESSION_LIMIT_REACHED');
        expect((error as SessionLimitReachedError).limit).toBe(3);
      }
    });

    it('lets the next one through once a reservation is released', () => {
      const { registry } = build(1);
      registry.reserve();
      registry.release();

      expect(() => registry.reserve()).not.toThrow();
    });

    it('never counts below zero, however often a slot is released', () => {
      const { registry } = build(1);
      registry.release();
      registry.release();

      expect(registry.size).toBe(0);
    });

    it('frees a slot when a session is removed', () => {
      const { registry, add } = build(1);
      add();
      registry.remove(id());

      expect(() => registry.reserve()).not.toThrow();
    });
  });

  describe('require', () => {
    it('answers the owner their own session', () => {
      const { registry, add } = build();
      add();

      expect(registry.require(id(), owner).session.id.value).toBe(SESSION_ID);
    });

    it('refuses an unknown session', () => {
      expect(() => build().registry.require(id(), owner)).toThrow(SessionNotFoundError);
    });

    it("refuses somebody else's as forbidden, not as absent", () => {
      // Two different facts, two different statuses. `403` tells a client to stop asking; `404`
      // tells it the session is gone. Collapsing them leaves it unable to act on either.
      const { registry, add } = build();
      add(aSession({ ownerId: 'auth|somebody-else' }));

      expect(() => registry.require(id(), stranger)).toThrow(SessionForbiddenError);
    });
  });

  it('keeps two sessions apart', () => {
    const { registry, add } = build();
    add();
    add(aSession({ id: '01J0ABCDEFGHJKMNPQRSTVWXY0' }));

    expect(registry.all()).toHaveLength(2);
  });

  it('forgets a session that is not there without complaining', () => {
    expect(() => build().registry.remove(id())).not.toThrow();
  });

  describe('by conversation — plan 04, S-24', () => {
    const SOURCE = '0f0e0d0c-0b0a-4908-8706-050403020100';
    const conversation = (raw: string): ClaudeSessionId => ClaudeSessionId.create(raw);

    it('says which conversation a live session is', () => {
      const { registry, add } = build();
      add();

      expect(registry.conversationOf(id())?.claudeSessionId.value).toBe(CONVERSATION_ID);
      expect(registry.conversationOf(id('01J0ABCDEFGHJKMNPQRSTVWXY0'))).toBeNull();
    });

    it("finds the caller's live session by the conversation it is", () => {
      const { registry, add } = build();
      add();

      expect(
        registry.findConversation(conversation(CONVERSATION_ID), owner)?.session.id.value,
      ).toBe(SESSION_ID);
    });

    it('finds a fork by the conversation it continues — resuming it twice is one request', () => {
      const { registry, add } = build();
      add(aSession(), aConversation(CONVERSATION_ID, SOURCE));

      expect(registry.findConversation(conversation(SOURCE), owner)).not.toBeNull();
    });

    it("does not hand the caller somebody else's live session", () => {
      // A continuation of a conversation begun elsewhere is theirs; the caller gets a fork of
      // their own, not an attach to a stream they may not watch.
      const { registry, add } = build();
      add();

      expect(registry.findConversation(conversation(CONVERSATION_ID), stranger)).toBeNull();
    });

    it('does not count a session that has closed and not yet left', () => {
      const { registry, add } = build();
      const session = aSession();
      add(session);
      session.close('closedByUser');

      expect(registry.findConversation(conversation(CONVERSATION_ID), owner)).toBeNull();
    });

    it('answers nothing for a conversation no live session is', () => {
      const { registry, add } = build();
      add();

      expect(registry.findConversation(conversation(SOURCE), owner)).toBeNull();
    });
  });
});

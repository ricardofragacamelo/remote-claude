import { describe, expect, it } from 'vitest';

import { SessionRegistry } from '@application/session';
import { UserId } from '@domain/auth';
import {
  SessionForbiddenError,
  SessionId,
  SessionLimitReachedError,
  SessionNotFoundError,
} from '@domain/session';
import { aSession, RecordingHandle, SESSION_ID } from '../../../support/builders/session.builder';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const id = (raw = SESSION_ID): SessionId => SessionId.create(raw);

/** A registry with the given limit, and a helper that adds one more session to it. */
function build(limit = 10): {
  registry: SessionRegistry;
  add: (session?: ReturnType<typeof aSession>) => void;
} {
  const registry = new SessionRegistry(limit);

  return {
    registry,
    add: (session = aSession()) => {
      registry.add({ session, handle: new RecordingHandle() });
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
});

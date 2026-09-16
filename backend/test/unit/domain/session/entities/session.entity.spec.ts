import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { Session, SessionId } from '@domain/session';
import { aSession } from '../../../../support/builders/session.builder';

const id = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const owner = UserId.create('auth|owner');
const openedAt = new Date('2026-09-13T12:00:00.000Z');

describe('Session', () => {
  it('opens with no pings recorded', () => {
    const session = Session.open(id, owner, openedAt);

    expect(session.pingCount).toBe(0);
    expect(session.lastPingedAt).toEqual(openedAt);
    expect(session.openedAt).toEqual(openedAt);
  });

  it('counts the first ping and reports the instant it was given', () => {
    const session = Session.open(id, owner, openedAt);
    const at = new Date('2026-09-13T12:00:05.000Z');

    const pong = session.ping(at, 'nonce-1');

    expect(pong.pingCount).toBe(1);
    expect(pong.pingedAt).toEqual(at);
    expect(pong.nonce).toBe('nonce-1');
    expect(pong.sessionId.equals(id)).toBe(true);
  });

  it('keeps counting across pings, and moves the last ping forward', () => {
    const session = Session.open(id, owner, openedAt);
    const second = new Date('2026-09-13T12:00:10.000Z');

    session.ping(new Date('2026-09-13T12:00:05.000Z'), 'a');
    const pong = session.ping(second, 'b');

    expect(pong.pingCount).toBe(2);
    expect(session.lastPingedAt).toEqual(second);
  });

  it('restores the count and the timestamps it was persisted with', () => {
    const session = aSession({ pingCount: 7, lastPingedAt: new Date('2026-09-13T13:00:00.000Z') });

    expect(session.pingCount).toBe(7);
    expect(session.lastPingedAt).toEqual(new Date('2026-09-13T13:00:00.000Z'));
  });

  it('recognises its owner', () => {
    expect(aSession({ ownerId: 'auth|owner' }).isOwnedBy(UserId.create('auth|owner'))).toBe(true);
  });

  it('does not recognise anybody else', () => {
    expect(aSession({ ownerId: 'auth|owner' }).isOwnedBy(UserId.create('auth|other'))).toBe(false);
  });

  it('round-trips through its snapshot', () => {
    const original = aSession({ pingCount: 3 });

    const restored = Session.restore(original.snapshot());

    expect(restored.snapshot()).toEqual(original.snapshot());
  });
});

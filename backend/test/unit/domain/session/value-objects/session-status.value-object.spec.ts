import { describe, expect, it } from 'vitest';

import { ALLOWED_TRANSITIONS, canTransition, SESSION_STATUSES } from '@domain/session';

describe('the session state machine', () => {
  it('names every status the contract names', () => {
    expect([...SESSION_STATUSES]).toEqual([
      'starting',
      'idle',
      'thinking',
      'running',
      'waitingPermission',
      'closed',
    ]);
  });

  it.each([
    ['starting', 'idle'],
    ['idle', 'thinking'],
    ['thinking', 'running'],
    ['running', 'thinking'],
    ['thinking', 'waitingPermission'],
    ['running', 'waitingPermission'],
    ['waitingPermission', 'running'],
    ['waitingPermission', 'thinking'],
    ['waitingPermission', 'idle'],
    ['running', 'idle'],
    ['thinking', 'idle'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each(SESSION_STATUSES.filter((status) => status !== 'closed'))(
    'allows %s → closed, because anything can end',
    (from) => {
      expect(canTransition(from, 'closed')).toBe(true);
    },
  );

  it.each([
    ['starting', 'thinking'],
    ['starting', 'running'],
    ['starting', 'waitingPermission'],
    ['idle', 'running'],
    ['idle', 'waitingPermission'],
    ['thinking', 'starting'],
    ['idle', 'starting'],
  ] as const)('refuses %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('never leaves `closed`', () => {
    // A session whose subprocess is gone does not come back. Allowing a way out would leave a
    // registry entry pointing at a runner that is not there.
    expect(ALLOWED_TRANSITIONS.closed).toEqual([]);

    for (const status of SESSION_STATUSES) {
      expect(canTransition('closed', status)).toBe(false);
    }
  });

  it('never reports staying put as a transition', () => {
    for (const status of SESSION_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('gives every status a row, so the table is the whole specification', () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...SESSION_STATUSES].sort());
  });
});

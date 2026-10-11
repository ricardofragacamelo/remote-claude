import { describe, expect, it } from 'vitest';

import type { SessionEvent } from '@application/session';

describe('SessionEvent — the union of the contract’s events (plan 28, B-09, S-29)', () => {
  it('takes an event of the contract with the payload the contract declares', () => {
    const event: SessionEvent = { type: 'session.statusChanged', payload: { status: 'idle' } };

    expect(event.type).toBe('session.statusChanged');
  });

  it('refuses, at compile time, a type the contract does not have and a payload it does not declare', () => {
    const status = { status: 'starting' } as const;
    // @ts-expect-error — `session.madeUp` is no event of the contract, and `tsc` says so.
    const unknownType: SessionEvent = { type: 'session.madeUp', payload: {} };
    // @ts-expect-error — `starting` is not a status the contract announces.
    const wrongPayload: SessionEvent = { type: 'session.statusChanged', payload: status };

    expect([unknownType.type, wrongPayload.type]).toHaveLength(2);
  });
});

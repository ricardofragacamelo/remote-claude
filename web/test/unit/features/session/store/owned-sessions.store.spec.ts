import { beforeEach, describe, expect, it } from 'vitest';

import { useOwnedSessionsStore } from '@/features/session/store/owned-sessions.store';

/** The sessions this browser opened — plan 05, S-84. */
describe('the sessions this browser opened', () => {
  beforeEach(() => {
    useOwnedSessionsStore.setState({ owned: [] });
  });

  it('starts with none', () => {
    expect(useOwnedSessionsStore.getState().owned).toEqual([]);
  });

  it('keeps each one it is told about, in the order it was told', () => {
    useOwnedSessionsStore.getState().claim('session-1');
    useOwnedSessionsStore.getState().claim('session-2');

    expect(useOwnedSessionsStore.getState().owned).toEqual(['session-1', 'session-2']);
  });

  it('counts a session claimed twice once — the starter and the screen both see it open', () => {
    const { claim } = useOwnedSessionsStore.getState();
    claim('session-1');
    const before = useOwnedSessionsStore.getState();

    claim('session-1');

    expect(useOwnedSessionsStore.getState().owned).toEqual(['session-1']);
    // Nothing changed, so nothing watching it is told it did.
    expect(useOwnedSessionsStore.getState()).toBe(before);
  });
});

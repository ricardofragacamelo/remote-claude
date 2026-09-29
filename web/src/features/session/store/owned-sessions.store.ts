import { create } from 'zustand';

/**
 * The sessions this browser opened — the ones it may close.
 *
 * A store, not the state of one screen, because the screen that opens a session is never the one
 * that shows it: the start screen sends `session.start` and moves to the session once
 * `session.started` names it, and the history screen does the same for a resume. Kept in the
 * session screen alone, the ownership was learnt by a screen that did not exist yet when the answer
 * arrived — and the browser that had just opened a session was told it was somebody else's (plan
 * 05, found by S-43).
 */
export interface OwnedSessionsState {
  readonly owned: readonly string[];

  /** This browser opened `sessionId`, or joined its own live one. Claiming twice is one claim. */
  claim(sessionId: string): void;
}

export const useOwnedSessionsStore = create<OwnedSessionsState>((set) => ({
  owned: [],
  claim: (sessionId) => {
    set((state) =>
      state.owned.includes(sessionId) ? state : { owned: [...state.owned, sessionId] },
    );
  },
}));

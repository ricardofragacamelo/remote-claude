import { useEffect, useRef } from 'react';

import { liveSessionStoreOf } from '../store/live-session.store';

/** What moved the disk: a turn that completed, or an undo — or a rejection — that landed. */
export interface DiskMove {
  readonly rewound: boolean;
}

/**
 * Calls `react` whenever what a session wrote may have changed: a turn completed — it may have
 * written files — or an undo or a rejection landed — it certainly did. Watched on the store and not
 * on a render, because what matters is the change, not the value.
 */
export function useDiskMoves(sessionId: string, react: (move: DiskMove) => void): void {
  const latest = useRef(react);

  useEffect(() => {
    latest.current = react;
  });

  useEffect(
    () =>
      liveSessionStoreOf(sessionId).subscribe((state, previous) => {
        const rewound = state.lastRewind !== previous.lastRewind;

        if (rewound || state.lastTurn !== previous.lastTurn) {
          latest.current({ rewound });
        }
      }),
    [sessionId],
  );
}

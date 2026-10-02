import { useCallback } from 'react';

import { openDiff } from '@/features/editor';
import { changeDiffSides, toolDiffSides } from '../lib/diff-sides';

/** The ways to put a diff of what Claude changed in the editor of the folder tab. */
export interface DiffTabs {
  /** Before the tool and what it left (B-27). Opening it again focuses the same tab (S-120). */
  openToolDiff(toolUseId: string, path: string): void;

  /** A file of the changes, against before the session (B-28). */
  openChangeDiff(path: string): void;
}

/**
 * Opens a diff **in the editor of the same folder tab** — the panel and the editor are one tab, so
 * opening a diff is a gesture, never a navigation (plan 08, F4).
 */
export function useDiffTabs(folder: string, sessionId: string): DiffTabs {
  return {
    openToolDiff: useCallback(
      (toolUseId: string, path: string) => {
        const { left, right } = toolDiffSides(folder, sessionId, toolUseId, path);
        openDiff(folder, left, right);
      },
      [folder, sessionId],
    ),
    openChangeDiff: useCallback(
      (path: string) => {
        const { left, right } = changeDiffSides(folder, sessionId, path);
        openDiff(folder, left, right);
      },
      [folder, sessionId],
    ),
  };
}

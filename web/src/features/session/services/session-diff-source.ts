import type { DiffSource } from '@/features/editor';
import { AppError } from '@/shared/api/errors';
import { SESSION_DIFF_SOURCE, sideKeyFrom } from '../lib/diff-sides';
import type { ChangeSide } from '../types/changes';
import { fetchChangeFile, fetchToolDiff } from './changes.service';

/** What a side nobody can read says — the tab shows it, translated. */
function unknownSide(): AppError {
  return new AppError('NOT_FOUND', 'sessions.diff.sideUnknown', 'diff-source');
}

function textOf(side: ChangeSide): string {
  if (side.state === 'absent') {
    return '';
  }

  if (side.state !== 'content' || side.content === null) {
    throw unknownSide();
  }

  return side.content;
}

/**
 * Where the editor reads the sides of a diff of what Claude changed (plan 08, B-27, B-28): the
 * diff of a tool, or a file of the changes — asked of the backend when the tab shows, and again
 * when it is opened anew.
 */
export const SESSION_DIFF_READER: DiffSource = {
  id: SESSION_DIFF_SOURCE,
  position: 100,
  read: async (_folder, raw) => {
    const key = sideKeyFrom(raw);

    if (key === null) {
      throw unknownSide();
    }

    if (key.toolUseId !== undefined) {
      const diff = await fetchToolDiff(key.sessionId, key.toolUseId);
      return textOf(key.side === 'before' ? diff.before : diff.after);
    }

    const file = await fetchChangeFile(key.sessionId, key.path);
    return textOf(key.side === 'before' ? file.before : file.now);
  },
};

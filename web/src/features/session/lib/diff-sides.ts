import type { DiffSide } from '@/features/editor';
import { relativeTo } from '@/shared/lib/folder-path';
import { isRecord, readText } from '@/shared/lib/json';

export { relativeTo } from '@/shared/lib/folder-path';

/** The id the session registers its sides of a diff under, in the editor. */
export const SESSION_DIFF_SOURCE = 'session';

/** Which text of a session a side of a diff is. */
export interface SessionSideKey {
  readonly sessionId: string;

  /** A tool's diff — or, absent, the changes of the session. */
  readonly toolUseId?: string;

  /** The file, absolute. */
  readonly path: string;
  readonly side: 'before' | 'after';
}

/** The last segment of a path — what a person calls the file. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function side(folder: string, key: SessionSideKey, labelKey: string): DiffSide {
  return {
    path: relativeTo(folder, key.path) ?? nameOf(key.path),
    source: 'provided',
    provided: { source: SESSION_DIFF_SOURCE, key: JSON.stringify(key), labelKey },
  };
}

/** The two sides of a tool's diff: before the tool, and what it left (B-27). */
export function toolDiffSides(
  folder: string,
  sessionId: string,
  toolUseId: string,
  path: string,
): { readonly left: DiffSide; readonly right: DiffSide } {
  const key = { sessionId, toolUseId, path };

  return {
    left: side(folder, { ...key, side: 'before' }, 'sessions.diff.before'),
    right: side(folder, { ...key, side: 'after' }, 'sessions.diff.after'),
  };
}

/**
 * The two sides of a file of the changes: before the session, and the file as it is — the disk of
 * the folder when the file is in it, so the tab follows the file (B-28).
 */
export function changeDiffSides(
  folder: string,
  sessionId: string,
  path: string,
): { readonly left: DiffSide; readonly right: DiffSide } {
  const relative = relativeTo(folder, path);

  return {
    left: side(folder, { sessionId, path, side: 'before' }, 'sessions.diff.beforeSession'),
    right:
      relative === null
        ? side(folder, { sessionId, path, side: 'after' }, 'sessions.diff.now')
        : { path: relative, source: 'disk' },
  };
}

/** A key the editor handed back, as far as it can be trusted. */
export function sideKeyFrom(key: string): SessionSideKey | null {
  let value: unknown;

  try {
    value = JSON.parse(key);
  } catch {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const sessionId = readText(value, 'sessionId');
  const path = readText(value, 'path');
  const which = value['side'];
  const toolUseId = readText(value, 'toolUseId');

  if (sessionId === null || path === null || (which !== 'before' && which !== 'after')) {
    return null;
  }

  return { sessionId, path, side: which, ...(toolUseId === null ? {} : { toolUseId }) };
}

import type { Hunk, HunkLine } from '@/shared/lib/diff-hunk';
import { api } from '@/shared/api/api';
import type { WsClient } from '@/shared/api/ws-client';
import { isRecord, readText } from '@/shared/lib/json';
import type {
  ChangeFile,
  ChangeKind,
  ChangeSide,
  ChangeSideState,
  FileChange,
  SessionChanges,
  ToolDiff,
} from '../types/changes';
import { SESSION_COMMANDS } from './live-session.service';

/** The commands that reject what a session changed, and undo a rejection. Names of the contract. */
export const CHANGE_COMMANDS = {
  rejectChange: 'session.rejectChange',
  restoreChange: 'session.restoreChange',
} as const;

const SIDE_STATES = new Set<string>(['content', 'absent', 'unavailable', 'notRestorable']);
const KINDS = new Set<string>(['created', 'modified', 'deleted']);
const LINE_KINDS = new Set<string>(['context', 'added', 'removed']);

const sessionPath = (sessionId: string): string => `/sessions/${encodeURIComponent(sessionId)}`;

/**
 * The diff of one tool of a live session — before and after, and the hunks between (plan 08, B-25).
 *
 * @throws {import('@/shared/api/errors').AppError} `TOOL_USE_NOT_FOUND`, `DIFF_NOT_APPLICABLE`,
 *   `FILE_NOT_TEXT`, `FORBIDDEN` / `SESSION_NOT_FOUND`
 */
export async function fetchToolDiff(sessionId: string, toolUseId: string): Promise<ToolDiff> {
  const body = await api.get<unknown>(
    `${sessionPath(sessionId)}/tools/${encodeURIComponent(toolUseId)}/diff`,
  );
  const record = isRecord(body) ? body : {};

  return {
    path: readText(record, 'path') ?? '',
    toolName: readText(record, 'toolName') ?? '',
    scope: record['scope'] === 'file' ? 'file' : 'edit',
    before: sideOf(record['before']),
    after: sideOf(record['after']),
    hunks: hunksOf(record['hunks']),
  };
}

/** Every file a live session changed, against before the session (B-26). */
export async function fetchChanges(sessionId: string): Promise<SessionChanges> {
  const body = await api.get<unknown>(`${sessionPath(sessionId)}/changes`);
  const record = isRecord(body) ? body : {};
  const files = Array.isArray(record['files']) ? record['files'] : [];

  return { promptId: readText(record, 'promptId'), files: files.flatMap(fileChangeOf) };
}

/** One file of the changes, whole: before, now, the hunks and the revision they were computed on. */
export async function fetchChangeFile(sessionId: string, path: string): Promise<ChangeFile> {
  const body = await api.get<unknown>(
    `${sessionPath(sessionId)}/changes/file?path=${encodeURIComponent(path)}`,
  );
  const record = isRecord(body) ? body : {};

  return {
    path: readText(record, 'path') ?? path,
    kind: kindOf(record['kind']),
    promptId: readText(record, 'promptId') ?? '',
    modifiedOutside: record['modifiedOutside'] === true,
    before: sideOf(record['before']),
    now: sideOf(record['now']),
    revision: readText(record, 'revision') ?? '',
    hunks: hunksOf(record['hunks']),
  };
}

/**
 * Rejects whole files: puts them back the way they were before the turn `promptId` — every file the
 * session changed when `paths` is absent (B-30).
 *
 * @returns the id of the command frame, or `null` when nothing left
 */
export function rejectFiles(
  client: WsClient,
  sessionId: string,
  promptId: string,
  paths?: readonly string[],
): string | null {
  return client.issue(SESSION_COMMANDS.rewindFiles, {
    sessionId,
    promptId,
    ...(paths === undefined ? {} : { paths }),
  });
}

/** Rejects one hunk of a file, against the revision the hunks were computed on (B-31). */
export function rejectHunk(
  client: WsClient,
  sessionId: string,
  change: { readonly path: string; readonly hunkId: string; readonly revision: string },
): string | null {
  return client.issue(CHANGE_COMMANDS.rejectChange, { sessionId, ...change });
}

/** Undoes the last rejection of a file, while the file is still what the rejection left. */
export function restoreChange(client: WsClient, sessionId: string, path: string): string | null {
  return client.issue(CHANGE_COMMANDS.restoreChange, { sessionId, path });
}

function fileChangeOf(value: unknown): FileChange[] {
  if (!isRecord(value)) {
    return [];
  }

  const path = readText(value, 'path');
  const kind = kindOf(value['kind']);
  const promptId = readText(value, 'promptId');

  if (path === null || kind === null || promptId === null) {
    return [];
  }

  return [
    {
      path,
      kind,
      promptId,
      modifiedOutside: value['modifiedOutside'] === true,
      added: countOf(value['added']),
      removed: countOf(value['removed']),
      revision: readText(value, 'revision') ?? '',
    },
  ];
}

function kindOf(value: unknown): ChangeKind | null {
  return typeof value === 'string' && KINDS.has(value) ? (value as ChangeKind) : null;
}

function countOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A side as the backend said it — an unreadable one is a side nobody knows. */
function sideOf(value: unknown): ChangeSide {
  const record = isRecord(value) ? value : {};
  const state = readText(record, 'state');

  return {
    state: state !== null && SIDE_STATES.has(state) ? (state as ChangeSideState) : 'unavailable',
    content: typeof record['content'] === 'string' ? record['content'] : null,
    reason: readText(record, 'reason'),
  };
}

function hunksOf(value: unknown): Hunk[] {
  return (Array.isArray(value) ? value : []).flatMap((hunk): Hunk[] => {
    if (!isRecord(hunk) || readText(hunk, 'id') === null) {
      return [];
    }

    const lines = (Array.isArray(hunk['lines']) ? hunk['lines'] : []).flatMap(lineOf);

    return [
      {
        id: readText(hunk, 'id') ?? '',
        oldStart: countOf(hunk['oldStart']) ?? 1,
        newStart: countOf(hunk['newStart']) ?? 1,
        lines,
      },
    ];
  });
}

function lineOf(value: unknown): HunkLine[] {
  if (!isRecord(value) || typeof value['text'] !== 'string') {
    return [];
  }

  const kind = value['kind'];
  return typeof kind === 'string' && LINE_KINDS.has(kind)
    ? [{ kind: kind as HunkLine['kind'], text: value['text'] }]
    : [];
}

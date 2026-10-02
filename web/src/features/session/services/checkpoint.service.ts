import type { Envelope } from '@remote-claude/contracts';

import { api } from '@/shared/api/api';
import { isRecord, readText } from '@/shared/lib/json';
import type { WsClient } from '@/shared/api/ws-client';
import { toAppError } from '@/shared/api/errors';
import type { AppError } from '@/shared/api/errors';
import type { Checkpoint, PreservedFile, PreserveReason, RewindOutcome } from '../types/checkpoint';
import { SESSION_COMMANDS } from './live-session.service';

/** The shape the backend answers with. It stops existing at the end of this file. */
interface CheckpointsResponse {
  readonly checkpoints?: unknown;
}

/** The four reasons the contract carries. */
const PRESERVE_REASONS = new Set<string>([
  'modifiedOutside',
  'notRestorable',
  'unsafePath',
  'noBaseline',
]);

/** What says an undo stopped short. The backend's key, for the one error that is session-wide. */
export const REWIND_INCOMPLETE = 'session.error.rewindIncomplete';

/**
 * The points the files of a live session can go back to, newest first, each with what undoing to
 * it would do **now** to every file — our own diff between the snapshot, what the session left and
 * what is on disk.
 *
 * An entry this build cannot read is dropped: a file whose outcome is unknown here cannot be
 * promised either way, and a point without an id cannot be aimed at.
 *
 * @throws {import('@/shared/api/errors').AppError} `INVALID_INPUT` for an id that is not one,
 *   `FORBIDDEN` / `SESSION_NOT_FOUND` for somebody else's session or one that is not live
 */
export async function fetchCheckpoints(sessionId: string): Promise<readonly Checkpoint[]> {
  const body = await api.get<CheckpointsResponse>(
    `/sessions/${encodeURIComponent(sessionId)}/checkpoints`,
  );

  return Array.isArray(body.checkpoints) ? body.checkpoints.flatMap(toCheckpoint) : [];
}

function toCheckpoint(value: unknown): Checkpoint[] {
  if (!isRecord(value)) {
    return [];
  }

  const promptId = readText(value, 'promptId');
  const at = readText(value, 'at');

  if (promptId === null || at === null) {
    return [];
  }

  const files = (Array.isArray(value['files']) ? value['files'] : []).filter(isRecord);
  const withOutcome = (outcome: string) => files.filter((file) => file['outcome'] === outcome);
  const reverted = withOutcome('revert');

  return [
    {
      promptId,
      label: readText(value, 'label'),
      at,
      restore: pathsOf(reverted.filter((file) => file['action'] === 'restore')),
      remove: pathsOf(reverted.filter((file) => file['action'] === 'delete')),
      preserve: preservedOf(withOutcome('preserve')),
      unchanged: pathsOf(withOutcome('unchanged')),
    },
  ];
}

/**
 * Sends the files a session wrote back to the way they were before a turn.
 *
 * @returns the id of the command frame — what a refusal names in `correlationId` — or `null` when
 *   the socket was not ready and nothing left
 */
export function rewindFiles(client: WsClient, sessionId: string, promptId: string): string | null {
  return client.issue(SESSION_COMMANDS.rewindFiles, { sessionId, promptId });
}

/**
 * What an undo did, in a frame — or `null` when the frame is not `session.rewound`.
 *
 * It arrives on the session stream, numbered like every other event, and for every connection
 * watching: the files changed for all of them.
 */
export function rewoundOf(frame: Envelope): RewindOutcome | null {
  const payload = frame.payload;

  if (frame.type !== 'session.rewound' || payload === undefined) {
    return null;
  }

  const promptId = readText(payload, 'promptId');

  if (promptId === null) {
    return null;
  }

  const reverted = recordsOf(payload['reverted']);

  return {
    promptId,
    restored: pathsOf(reverted.filter((file) => file['action'] === 'restored')),
    deleted: pathsOf(reverted.filter((file) => file['action'] === 'deleted')),
    preserved: preservedOf(recordsOf(payload['preserved'])),
    unchanged: pathsOf(recordsOf(payload['unchanged'])),
    failed: pathsOf(recordsOf(payload['failed'])),
    hunkId: readText(payload, 'hunkId'),
  };
}

/**
 * The session-wide error that follows an undo that stopped short, or `null` for any other frame.
 *
 * It names no command — the `session.rewound` before it already went to everybody watching — so
 * it is recognised by the session it belongs to and by its key.
 */
export function incompleteRewindOf(frame: Envelope, sessionId: string): AppError | null {
  const payload = frame.payload;
  const isIt =
    frame.kind === 'error' &&
    frame.correlationId === undefined &&
    frame.sessionId === sessionId &&
    payload !== undefined &&
    payload['messageKey'] === REWIND_INCOMPLETE;

  return isIt ? toAppError({ error: payload }, frame.traceId ?? frame.id) : null;
}

function recordsOf(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function pathsOf(files: readonly Readonly<Record<string, unknown>>[]): string[] {
  return files.flatMap((file) => {
    const path = readText(file, 'path');
    return path === null ? [] : [path];
  });
}

function preservedOf(files: readonly Readonly<Record<string, unknown>>[]): PreservedFile[] {
  return files.flatMap((file) => {
    const path = readText(file, 'path');
    const reason = file['reason'];

    return path !== null && typeof reason === 'string' && PRESERVE_REASONS.has(reason)
      ? [{ path, reason: reason as PreserveReason }]
      : [];
  });
}

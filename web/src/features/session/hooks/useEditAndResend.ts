import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { folderTabStore } from '@/features/workbench';
import type { AppError } from '@/shared/api/errors';
import { toAppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { logger } from '@/shared/logging/logger';
import { fetchCheckpoints, rewindFiles } from '../services/checkpoint.service';
import {
  forkConversation,
  refusalOf,
  resumeSession,
  sendPrompt,
  startedBy,
} from '../services/live-session.service';
import { claudePanelStore } from '../store/claude-panel.store';
import { liveSessionStoreOf } from '../store/live-session.store';
import { useOwnedSessionsStore } from '../store/owned-sessions.store';
import type { StreamMessage } from '../types/live-session';
import { checkpointKeys } from './useUndo';

/** A prompt being edited to be sent again. */
export interface Editing {
  readonly messageId: string;

  /** What the prompt said — what the composer starts with. */
  readonly original: string;

  /** The undo point of its turn, when its files can go back — `null` when none can (S-162). */
  readonly undoPoint: string | null;
}

/** What editing and resending gives the panel (plan 08, B-35). */
export interface EditAndResend {
  readonly editing: Editing | null;

  /** Also put the files back the way they were before that turn — off by default (S-162). */
  readonly undoFiles: boolean;
  readonly isSending: boolean;

  /** Why the fork was refused — a point that is not a prompt, or the CLI refusing it (S-164). */
  readonly error: AppError | null;

  /** The CLI refused the point: the plain resume is what is offered, never the same fork again. */
  readonly canResumeInstead: boolean;
  begin(message: StreamMessage): void;
  cancel(): void;
  setUndoFiles(undo: boolean): void;
  send(text: string): void;

  /** "Fork from here": the prompt sent again, unchanged, from before it — no editing first. */
  forkFrom(message: StreamMessage): void;
  resumeInstead(): void;
}

/**
 * Editing a prompt and sending it again — always a fork, never a truncation (D-19): a new
 * conversation continues the old one up to **before** the prompt, and the old one stays readable in
 * the history (S-161). The files do not go back with it — the fork does not take the undo — so the
 * undo of that turn is offered beside it, off by default (S-162).
 */
export function useEditAndResend(folder: string, sessionId: string): EditAndResend {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [undoFiles, setUndoFiles] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [sending, setSending] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const asked = useRef<{ readonly commandId: string; readonly text: string } | null>(null);
  const forked = useRef<string | null>(null);

  const live = liveSessionStoreOf(sessionId);

  useEffect(
    () =>
      wsClient.observe((frame) => {
        const pending = asked.current;
        const refusal = pending === null ? null : refusalOf(frame, pending.commandId);
        const opened = pending === null ? null : startedBy(frame, pending.commandId);

        if (refusal !== null) {
          asked.current = null;
          setSending(false);
          setError(refusal);
        } else if (opened !== null && pending !== null) {
          asked.current = null;
          setSending(false);
          setEditing(null);
          forked.current = opened;
          useOwnedSessionsStore.getState().claim(opened);
          sendPrompt(wsClient, opened, pending.text);
          claudePanelStore(folder).getState().show('session', opened);
          folderTabStore(folder).getState().showSession(opened);
        } else if (isForkRejection(frame, forked.current)) {
          setRejected(live.getState().conversationId);
          setError(toAppError({ error: frame.payload }, frame.traceId ?? frame.id));
        }
      }),
    [folder, live],
  );

  const begin = useCallback(
    (message: StreamMessage) => {
      setError(null);
      setUndoFiles(false);
      setEditing({ messageId: message.messageId, original: message.text, undoPoint: null });

      // The undo point of that turn is the one labelled with what the prompt said.
      void queryClient
        .fetchQuery({
          queryKey: checkpointKeys.of(sessionId),
          queryFn: () => fetchCheckpoints(sessionId),
        })
        .then((points) => {
          const point = points.find((each) => each.label === message.text);
          setEditing((now) =>
            now?.messageId === message.messageId
              ? { ...now, undoPoint: point?.promptId ?? null }
              : now,
          );
        })
        .catch((failure: unknown) => {
          // No undo is offered then — the box says none of that turn's files can go back.
          logger.warn(
            { op: 'session.editUndoPoint', sessionId, error: String(failure) },
            'the undo points of the session could not be read',
          );
        });
    },
    [queryClient, sessionId],
  );

  /** Opens the fork before `messageId`, to send `text` there once it opened. */
  const fork = useCallback(
    (messageId: string, text: string) => {
      const conversationId = live.getState().conversationId;

      if (conversationId === null || asked.current !== null) {
        return;
      }

      const commandId = forkConversation(
        wsClient,
        live.getState().workspacePath ?? folder,
        conversationId,
        messageId,
      );

      if (commandId !== null) {
        asked.current = { commandId, text };
        setSending(true);
        setError(null);
        setRejected(null);
      }
    },
    [folder, live],
  );

  const send = useCallback(
    (text: string) => {
      if (editing === null) {
        return;
      }

      if (undoFiles && editing.undoPoint !== null && asked.current === null) {
        rewindFiles(wsClient, sessionId, editing.undoPoint);
      }

      fork(editing.messageId, text);
    },
    [editing, fork, sessionId, undoFiles],
  );

  return {
    editing,
    undoFiles,
    isSending: sending,
    error,
    canResumeInstead: rejected !== null,
    begin,
    cancel: useCallback(() => {
      setEditing(null);
      setError(null);
    }, []),
    setUndoFiles,
    send,
    forkFrom: useCallback(
      (message: StreamMessage) => {
        fork(message.messageId, message.text);
      },
      [fork],
    ),
    resumeInstead: useCallback(() => {
      if (rejected !== null) {
        resumeSession(wsClient, live.getState().workspacePath ?? folder, rejected);
        setRejected(null);
        setError(null);
      }
    }, [folder, live, rejected]),
  };
}

/** Whether a frame is the CLI refusing the fork this panel just opened. */
function isForkRejection(
  frame: {
    readonly kind: string;
    readonly sessionId?: string;
    readonly payload?: Record<string, unknown>;
  },
  forked: string | null,
): boolean {
  return (
    forked !== null &&
    frame.kind === 'error' &&
    frame.sessionId === forked &&
    frame.payload?.['code'] === 'SESSION_FORK_REJECTED'
  );
}

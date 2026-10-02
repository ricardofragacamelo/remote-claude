import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { attachmentsOf } from '../lib/context-set';
import { refusalOf, sendPrompt } from '../services/live-session.service';
import type { ContextItem } from '../types/context';
import type { ContextSet } from './useContextSet';
import { useContextSet } from './useContextSet';
import { usePanelDraft } from './usePanelTabs';

/** A prompt that left, and what it carried — what comes back if it is refused. */
export interface SentPrompt {
  readonly commandId: string;
  readonly text: string;
  readonly items: readonly ContextItem[];
}

/**
 * The first prompt of a draft, sent the moment its session opened (D-07): the composer of the
 * session's tab takes over watching for its refusal, so the text and the context come back there.
 */
const firstPrompts = new Map<string, SentPrompt>();

export function handOverFirstPrompt(sessionId: string, sent: SentPrompt): void {
  firstPrompts.set(sessionId, sent);
}

/** The composer of a live session: its context, its prompt, and why the last one was refused. */
export interface SessionComposer {
  readonly context: ContextSet;
  readonly error: AppError | null;

  /** How many sends were refused — the box starts again from the text given back. */
  readonly refusals: number;
  send(text: string): void;
}

/**
 * Sends a prompt of a live session with its context (plan 08, B-46, B-47).
 *
 * The files of the set are checked again first: a file gone since it was chosen is marked, and the
 * send does not leave, with its path said (S-223). What leaves empties the set; a refusal of the
 * backend — a path outside the folder, an attachment it no longer holds — gives the text and the
 * whole set back, with the reason translated (S-216, S-222).
 */
export function useComposerSend(
  folder: string,
  tabKey: string,
  sessionId: string,
): SessionComposer {
  const context = useContextSet(folder, tabKey, sessionId);
  const draft = usePanelDraft(folder, tabKey);
  const [error, setError] = useState<AppError | null>(null);
  const [refusals, setRefusals] = useState(0);
  const sent = useRef<SentPrompt | null>(firstPrompts.get(sessionId) ?? null);
  const { restore, revalidate, say } = context;
  const { setText } = draft;

  useEffect(() => {
    firstPrompts.delete(sessionId);
  }, [sessionId]);

  const giveBack = useCallback(
    (prompt: Pick<SentPrompt, 'text' | 'items'>) => {
      restore(prompt.items);
      setText(prompt.text);
      setRefusals((count) => count + 1);
    },
    [restore, setText],
  );

  useEffect(
    () =>
      wsClient.observe((frame) => {
        const prompt = sent.current;
        const refusal = prompt === null ? null : refusalOf(frame, prompt.commandId);

        if (prompt !== null && refusal !== null) {
          sent.current = null;
          setError(refusal);
          giveBack(prompt);
        }
      }),
    [giveBack],
  );

  return {
    context,
    error,
    refusals,
    send: useCallback(
      (text: string) => {
        setError(null);
        void revalidate().then((items) => {
          // Only a file gone since it was checked can stop the send now: the box itself does not
          // send what is over a ceiling or waits on an upload.
          const gone = goneOf(items);

          if (gone !== null) {
            say({ key: 'composer.send.missing', params: { path: gone } });
            giveBack({ text, items });
            return;
          }

          const commandId = sendPrompt(wsClient, sessionId, text, attachmentsOf(folder, items));
          if (commandId === null) {
            // The socket is down: nothing left, and nothing is lost.
            giveBack({ text, items });
            return;
          }

          sent.current = { commandId, text, items };
          restore([]);
        });
      },
      [folder, giveBack, restore, revalidate, say, sessionId],
    ),
  };
}

/** The first file of the set that is gone from the folder, or `null`. */
function goneOf(items: readonly ContextItem[]): string | null {
  const gone = items.find(
    (item) => (item.kind === 'file' || item.kind === 'range') && item.missing,
  );
  return gone !== undefined && 'path' in gone ? gone.path : null;
}

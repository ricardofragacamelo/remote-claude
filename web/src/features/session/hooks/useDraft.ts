import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { folderTabStore } from '@/features/workbench';
import { refusalOf, sendPrompt, startDraft, startedBy } from '../services/live-session.service';
import { claudePanelStore, DEFAULT_CHOICES } from '../store/claude-panel.store';
import type { DraftChoices } from '../store/claude-panel.store';
import { useOwnedSessionsStore } from '../store/owned-sessions.store';
import { usePanelDraft } from './usePanelTabs';

/** A draft of the panel: what was chosen and written, and the way to send it. */
export interface Draft {
  readonly choices: DraftChoices;
  readonly text: string;

  /** A `session.start` left and neither the session nor its refusal came back. */
  readonly isStarting: boolean;

  /** Why the session was refused — the machine at its ceiling, say. Text and choices stay (S-153). */
  readonly error: AppError | null;

  /** How many starts were refused — the prompt box starts again from the text given back. */
  readonly refusals: number;
  setText(text: string): void;
  choose(choices: Partial<DraftChoices>): void;

  /** Opens the session with what was chosen, and sends `text` as its first prompt (S-152). */
  send(text: string): void;
}

/**
 * A new conversation, before it is one (plan 08, D-07): a draft of this browser, with **no**
 * subprocess behind it (~222 MB each). The first send opens the session — with the model, the mode
 * and the effort chosen here — and, once it opened, sends the prompt. Sending twice opens one
 * session (S-154); closing the draft leaves nothing in the backend (S-155).
 */
export function useDraft(folder: string, key: string, workspacePath: string): Draft {
  const panel = claudePanelStore(folder);
  const tab = useStore(panel, (state) => state.tabs.find((each) => each.key === key));
  const written = usePanelDraft(folder, key);
  const [error, setError] = useState<AppError | null>(null);
  const [starting, setStarting] = useState(false);
  const [refusals, setRefusals] = useState(0);
  const pending = useRef<{ readonly commandId: string; readonly text: string } | null>(null);

  useEffect(
    () =>
      wsClient.observe((frame) => {
        const asked = pending.current;
        if (asked === null) {
          return;
        }

        const refusal = refusalOf(frame, asked.commandId);
        const sessionId = startedBy(frame, asked.commandId);

        if (refusal !== null) {
          // The box emptied when it sent: the prompt is given back, to be sent again as it was.
          pending.current = null;
          panel.getState().setDraft(key, asked.text);
          setStarting(false);
          setError(refusal);
          setRefusals((count) => count + 1);
        } else if (sessionId !== null) {
          pending.current = null;
          setStarting(false);
          useOwnedSessionsStore.getState().claim(sessionId);
          sendPrompt(wsClient, sessionId, asked.text);
          panel.getState().promote(key, sessionId);
          folderTabStore(folder).getState().showSession(sessionId);
        }
      }),
    [folder, key, panel],
  );

  const choices = tab?.kind === 'draft' ? tab.choices : DEFAULT_CHOICES;

  return {
    choices,
    text: written.text,
    isStarting: starting,
    error,
    refusals,
    setText: written.setText,
    choose: useCallback(
      (next: Partial<DraftChoices>) => {
        panel.getState().setChoices(key, { ...choices, ...next });
      },
      [choices, key, panel],
    ),
    send: useCallback(
      (prompt: string) => {
        // One start for a draft, however many times Enter is pressed before it answers.
        if (pending.current !== null) {
          return;
        }

        const commandId = startDraft(wsClient, {
          workspacePath,
          model: choices.model,
          permissionMode: choices.mode,
          effort: choices.effort,
        });

        if (commandId !== null) {
          pending.current = { commandId, text: prompt };
          setStarting(true);
          setError(null);
        }
      },
      [choices, workspacePath],
    ),
  };
}

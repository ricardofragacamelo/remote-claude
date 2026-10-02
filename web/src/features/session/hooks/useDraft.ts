import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { folderTabStore } from '@/features/workbench';
import { attachmentsOf } from '../lib/context-set';
import { uploadHeld } from '../services/composer.service';
import { refusalOf, sendPrompt, startDraft, startedBy } from '../services/live-session.service';
import { claudePanelStore, DEFAULT_CHOICES, tabKeyOf } from '../store/claude-panel.store';
import type { ClaudePanelStore, DraftChoices } from '../store/claude-panel.store';
import { useOwnedSessionsStore } from '../store/owned-sessions.store';
import { handOverFirstPrompt } from './useComposerSend';
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
          void firstPrompt(panel, { folder, key, sessionId, text: asked.text });
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

/** What the first prompt of a draft needs once its session opened. */
interface FirstPrompt {
  readonly folder: string;
  readonly key: string;
  readonly sessionId: string;
  readonly text: string;
}

/**
 * The first prompt of a draft, with its context (plan 08, B-45, B-47): the files of the desktop the
 * draft held go to the new session as attachments first — never into the folder —, then the
 * prompt. An attachment refused there stops the prompt: the tab of the session gets the text and the
 * set back, the refused item marked. The refusal of the prompt itself is watched by the composer of
 * the session's tab, which gives them back the same way.
 */
async function firstPrompt(panel: ClaudePanelStore, first: FirstPrompt): Promise<void> {
  const items = await uploadHeld(panel.getState().contexts[first.key] ?? [], first.sessionId);
  const refused = items.some((item) => item.kind === 'upload' && item.error !== null);

  panel.getState().setContext(first.key, refused ? items : []);
  panel.getState().promote(first.key, first.sessionId);
  folderTabStore(first.folder).getState().showSession(first.sessionId);

  if (refused) {
    panel.getState().setDraft(tabKeyOf('session', first.sessionId), first.text);
    return;
  }

  const commandId = sendPrompt(
    wsClient,
    first.sessionId,
    first.text,
    attachmentsOf(first.folder, items),
  );
  if (commandId === null) {
    // The socket went down between the start and the prompt: what was meant is given back.
    panel.getState().setContext(tabKeyOf('session', first.sessionId), items);
    panel.getState().setDraft(tabKeyOf('session', first.sessionId), first.text);
    return;
  }

  handOverFirstPrompt(first.sessionId, { commandId, text: first.text, items });
}

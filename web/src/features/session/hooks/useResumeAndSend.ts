import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { claudePanelStore, tabKeyOf } from '../store/claude-panel.store';
import { liveSessionStoreOf } from '../store/live-session.store';
import { firstPrompt } from './useDraft';
import { useResumer } from './useResumeSession';

/** What the box of an ended session does with a prompt: resume the conversation, then send it. */
export interface ResumeAndSend {
  /** The conversation the session was is known — what a resume continues. */
  readonly canResume: boolean;

  /** A resume left and neither the session nor its refusal came back. */
  readonly isResuming: boolean;

  /** Why the resume was refused — the installation full, say. The text and the context stay. */
  readonly error: AppError | null;

  /** How many resumes were refused — the box starts again from the text given back. */
  readonly refusals: number;
  send(text: string): void;
}

/**
 * Sending in a session that ended resumes it, as the editor's extension does (plan 09, B-06, D-05):
 * the conversation continues in a new subprocess — which counts against the ceiling, as the strip
 * above the box says — and the prompt goes there, with its context, the way a draft's first prompt
 * does. The tab of the ended session becomes the resumed one's.
 *
 * Two Enters resume once (S-88); a refusal gives the text back to the box, the context untouched,
 * with the reason (S-89).
 */
export function useResumeAndSend(
  folder: string,
  sessionId: string,
  conversationId: string | null,
): ResumeAndSend {
  const key = tabKeyOf('session', sessionId);
  const text = useRef<string | null>(null);
  const [refusals, setRefusals] = useState(0);

  const onResumed = useCallback(
    (resumed: string) => {
      const prompt = text.current ?? '';
      text.current = null;
      void firstPrompt(claudePanelStore(folder), {
        folder,
        key,
        sessionId: resumed,
        text: prompt,
      });
    },
    [folder, key],
  );
  const resumer = useResumer(onResumed);
  const { error, resume } = resumer;

  // Refused: what was sent is given back to the box, to be sent again as it was.
  useEffect(() => {
    const given = text.current;

    if (error !== null && given !== null) {
      text.current = null;
      claudePanelStore(folder).getState().setDraft(key, given);
      setRefusals((count) => count + 1);
    }
  }, [error, folder, key]);

  return {
    canResume: conversationId !== null,
    isResuming: resumer.isResuming,
    error,
    refusals,
    send: useCallback(
      (prompt: string) => {
        if (conversationId === null || text.current !== null) {
          return;
        }

        text.current = prompt;
        const left = resume({
          conversationId,
          workspacePath: liveSessionStoreOf(sessionId).getState().workspacePath ?? folder,
        });

        if (!left) {
          // The socket is down: nothing left, and nothing is lost.
          text.current = null;
          claudePanelStore(folder).getState().setDraft(key, prompt);
          setRefusals((count) => count + 1);
        }
      },
      [conversationId, folder, key, resume, sessionId],
    ),
  };
}

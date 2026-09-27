import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

/**
 * The ways from one screen to another that more than one route offers, spelled once.
 *
 * A feature never learns the router exists — it is handed a callback — so each route builds the
 * same callback for it. Built in two places, the two drift: one of them ends up with a link the
 * other does not reproduce. Each answer is **stable** across renders, because the features that
 * take them rebuild a subscription whenever they change.
 */

/** To a live session. */
export function useOpenSession(): (sessionId: string) => void {
  const navigate = useNavigate();

  return useCallback(
    (sessionId: string) => {
      void navigate({ to: '/sessions/$sessionId', params: { sessionId } });
    },
    [navigate],
  );
}

/** To one conversation of the history — the whole of it, the part no ring buffer held included. */
export function useOpenConversation(): (conversationId: string) => void {
  const navigate = useNavigate();

  return useCallback(
    (conversationId: string) => {
      void navigate({ to: '/history/$conversationId', params: { conversationId } });
    },
    [navigate],
  );
}

import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

/**
 * The ways from one screen to another that more than one route offers, spelled once.
 *
 * A feature never learns the router exists — it is handed a callback — so each route builds the
 * same callback for it. Built in two places, the two drift: one of them ends up with a link the
 * other does not reproduce. Each answer is **stable** across renders, because the features that
 * take them rebuild a subscription whenever they change.
 *
 * There is no way to a session or to a conversation of the history any more: the live session is in
 * the tab of its folder, and the history comes back with the Sessions view of plan 08
 * ([06 · D-07](../../../docs/plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)).
 */

/**
 * To a folder, in the workbench — the folder in the search, never in the path
 * ([06 · D-06](../../../docs/plans/06-workbench/decisions.md#d-06--a-url-do-workbench)).
 */
export function useOpenFolder(): (folder: string) => void {
  const navigate = useNavigate();

  return useCallback(
    (folder: string) => {
      void navigate({ to: '/workbench', search: { folder } });
    },
    [navigate],
  );
}

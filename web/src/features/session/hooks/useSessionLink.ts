import { useQuery } from '@tanstack/react-query';

import { AppError } from '@/shared/api/errors';
import { fetchLiveSessions } from '../services/sessions-view.service';
import type { LiveSessionSummary } from '../types/sessions-view';
import { folderSessionKeys } from './useFolderSessions';

/** What a link to a session turned out to be: still being asked, one of the caller's, or not. */
export type SessionLinkState = 'checking' | 'live' | 'missing';

/**
 * Whether the session a link names is a live session of the caller in this folder (plan 08, S-53).
 *
 * Asked of the same list the Sessions view reads, so a link opened beside the view costs no second
 * request. A session that does not exist and one that is somebody else's answer alike — the list
 * holds only the caller's — and the panel says the session is gone, with the way back. A list that
 * cannot be read says nothing about the link: it is not called missing.
 */
export function useSessionLink(folder: string, sessionId: string | null): SessionLinkState {
  const live = useQuery<readonly LiveSessionSummary[], AppError>({
    queryKey: folderSessionKeys.live(folder),
    queryFn: () => fetchLiveSessions(folder),
    enabled: sessionId !== null,
    staleTime: 0,
  });

  if (sessionId === null || live.data === undefined) {
    return 'checking';
  }

  return live.data.some((session) => session.sessionId === sessionId) ? 'live' : 'missing';
}

/**
 * What a link to a session that is not live — or not the caller's — leaves on the panel: the two
 * read alike, because telling them apart would say that an id exists (S-53).
 */
export const SESSION_LINK_GONE = new AppError(
  'SESSION_NOT_FOUND',
  'session.error.notFound',
  'link',
);

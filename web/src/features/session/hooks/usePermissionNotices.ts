import { useEffect, useRef } from 'react';

import { wsClient } from '@/shared/api/ws';
import { folderName } from '@/shared/lib/folder-name';
import { isRecord } from '@/shared/lib/json';
import { notify } from '@/shared/lib/notify';
import { folderOfSession } from '../store/session-folders.store';

/**
 * Says, everywhere in the app, that Claude asks something in a folder tab that is not on screen
 * (plan 08, B-42, S-189) — with the way to it: the tab, the conversation, the card. The question on
 * screen needs no notice; the card is already there.
 *
 * @param activeFolder the folder of the tab on screen, or `null` away from the workbench
 * @param onOpen takes the person to the folder tab and the session that asks
 */
export function usePermissionNotices(
  activeFolder: string | null,
  onOpen: (folder: string, sessionId: string) => void,
): void {
  const latest = useRef({ activeFolder, onOpen });

  useEffect(() => {
    latest.current = { activeFolder, onOpen };
  });

  useEffect(
    () =>
      wsClient.onSessionFrame((frame) => {
        const sessionId = frame.sessionId;
        const folder = folderOfSession(sessionId);

        // The question on screen needs no notice: its card is already there.
        if (
          frame.type !== 'permission.requested' ||
          sessionId === undefined ||
          folder === null ||
          folder === latest.current.activeFolder
        ) {
          return;
        }

        notify({
          severity: 'warning',
          // A question says it is one, and never what it asks (plan 24, B-16).
          messageKey: isRecord(frame.payload?.['interaction'])
            ? 'permission.question.notice'
            : 'notification.permission.waiting',
          params: { folder: folderName(folder) },
          actions: [
            {
              labelKey: 'sessions.badge.open',
              run: () => {
                latest.current.onOpen(folder, sessionId);
              },
            },
          ],
        });
      }),
    [],
  );
}

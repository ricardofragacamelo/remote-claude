import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import type { Envelope } from '@remote-claude/contracts';

import { wsClient } from '@/shared/api/ws';
import { folderName } from '@/shared/lib/folder-name';
import { isRecord } from '@/shared/lib/json';
import { readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';
import { folderOfSession } from '../store/session-folders.store';

/** What the browser lets this page do, or that it cannot at all. */
export type BrowserPermission = 'default' | 'granted' | 'denied' | 'unsupported';

const PREFERENCE = 'session.browserNotifications';

/** Whether the person turned the notifications of the browser on — only they can (D-21). */
const useNotificationPreference = create<{ readonly enabled: boolean }>(() => ({
  // Anything but a `true` kept by this visitor is off: only the person turns them on.
  enabled: readVisitor(PREFERENCE, (value) => value === true) ?? false,
}));

function permissionNow(): BrowserPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** The notifications of the browser, as the panel offers them. */
export interface BrowserNotifications {
  readonly enabled: boolean;
  readonly permission: BrowserPermission;

  /** Asks the browser — only ever from a person's own click, never on opening (D-21). */
  enable(): void;
  disable(): void;
}

/** The switch of the notifications of the browser (plan 08, B-42, D-21). */
export function useBrowserNotifications(): BrowserNotifications {
  const enabled = useNotificationPreference((state) => state.enabled);
  const [permission, setPermission] = useState<BrowserPermission>(permissionNow);

  const set = (value: boolean): void => {
    useNotificationPreference.setState({ enabled: value });
    writeVisitor(PREFERENCE, value);
  };

  return {
    enabled,
    permission,
    // Offered only where the browser has them: the button is off where it has none.
    enable: useCallback(() => {
      void Notification.requestPermission().then((answer) => {
        setPermission(answer);
        set(answer === 'granted');
      });
    }, []),
    disable: useCallback(() => {
      set(false);
    }, []),
  };
}

/** The words of each notification — named in full so the i18n check sees each key. */
const SAYS = {
  permission: 'sessions.browserNotice.permission',
  question: 'permission.question.notice',
  turn: 'sessions.browserNotice.turn',
} as const;

/** What a frame is worth a notification for — a question of Claude said apart (plan 24, B-16). */
function whatOf(frame: Envelope): keyof typeof SAYS | null {
  if (frame.type === 'permission.requested') {
    return isRecord(frame.payload?.['interaction']) ? 'question' : 'permission';
  }

  return frame.type === 'turn.completed' ? 'turn' : null;
}

/**
 * Tells the browser when a turn ends or a question is asked, **only** with the page hidden and only
 * once the person turned it on — saying the folder and what happened, never the command: the
 * notification shows on a locked screen (D-21, S-192).
 */
export function useBrowserNotifier(): void {
  const { t } = useTranslation();
  const enabled = useNotificationPreference((state) => state.enabled);

  useEffect(
    () =>
      wsClient.onSessionFrame((frame) => {
        const what = whatOf(frame);
        const folder = folderOfSession(frame.sessionId);

        if (
          what === null ||
          folder === null ||
          !enabled ||
          permissionNow() !== 'granted' ||
          document.visibilityState !== 'hidden'
        ) {
          return;
        }

        new Notification(t(SAYS[what], { folder: folderName(folder) }));
      }),
    [enabled, t],
  );
}

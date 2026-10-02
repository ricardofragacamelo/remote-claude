import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useFolderTab } from '@/features/workbench';
import { folderName } from '@/shared/lib/folder-name';
import { usePendingPermissions } from '../../hooks/usePendingPermissions';

/**
 * How many questions Claude is waiting on in a folder tab, on the tab itself and on the activity bar
 * (plan 08, B-42) — so a question never gets lost by being asked where nobody is looking: a tab not
 * on screen, a panel closed (S-188, S-189). Answered on another device, it goes (S-190).
 */
export function PermissionCount({ folder }: { readonly folder: string }): React.JSX.Element | null {
  const { t } = useTranslation();
  const count = usePendingPermissions(folder);

  return count === 0 ? null : (
    <span
      className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-ui-xs text-destructive-foreground"
      aria-label={t('sessions.badge.label', { count })}
      role="status"
    >
      {count}
    </span>
  );
}

/** The badge on the view of Claude's sessions in the activity bar — said aloud when the panel is closed. */
export function ActivityPermissionBadge({
  folder,
}: {
  readonly folder: string;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const count = usePendingPermissions(folder);
  const { secondaryOpen } = useFolderTab(folder);
  const [said, setSaid] = useState('');
  const before = useRef(0);

  // Announced when a new question arrives and the panel that would show it is closed (S-188).
  useEffect(() => {
    if (count > before.current && !secondaryOpen) {
      setSaid(t('sessions.badge.announce', { folder: folderName(folder) }));
    }
    before.current = count;
  }, [count, folder, secondaryOpen, t]);

  return (
    <>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
      {count > 0 && (
        <span
          className="absolute top-1 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-ui-xs text-destructive-foreground"
          aria-label={t('sessions.badge.label', { count })}
        >
          {count}
        </span>
      )}
    </>
  );
}

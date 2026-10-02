import type { ComponentType } from 'react';

import { useFolderTab } from '@/features/workbench';
import type { StatusItemProps } from '@/features/workbench';

/** What an item of the status bar about a session draws: the folder of the tab, and its session. */
export interface SessionItemProps {
  readonly folder: string;
  readonly sessionId: string;
}

/**
 * An item of the status bar about the session the folder tab shows — and, with none, not there at
 * all (plan 08, S-187): the bar never holds an empty place.
 */
export function sessionStatusItem(
  Item: ComponentType<SessionItemProps>,
): ComponentType<StatusItemProps> {
  return function SessionStatusItem({ tab }: StatusItemProps): React.JSX.Element | null {
    const { sessionId } = useFolderTab(tab.path);
    return sessionId === null ? null : <Item folder={tab.path} sessionId={sessionId} />;
  };
}

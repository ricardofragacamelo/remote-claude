import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export interface StateStripProps {
  /** What the strip says — one line, translated. */
  readonly children: ReactNode;

  /**
   * `status` for what changes as it happens, `note` for what is true of the whole conversation,
   * `alert` for what failed.
   */
  readonly role?: 'status' | 'note' | 'alert';

  /** The one thing to do about it — try again, say. */
  readonly action?: ReactNode;

  /** Stays at the top of the conversation while it scrolls: the connection, which is about now. */
  readonly pinned?: boolean;
}

/**
 * A state of the conversation as **one line**, never a card (plan 09, B-06): disconnected, a partial
 * replay, the history loading or failed, the session ended. It says what is true and, when there is
 * one, the way out of it — and it takes the room of a line, so the box under it never moves more
 * than that.
 */
export function StateStrip({
  children,
  role = 'status',
  action,
  pinned = false,
}: StateStripProps): React.JSX.Element {
  return (
    <div
      role={role}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded bg-muted px-2 py-1 text-ui-xs',
        pinned && 'sticky top-0 z-10',
        role === 'alert' && 'border border-destructive bg-transparent text-destructive',
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

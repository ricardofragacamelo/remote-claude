import type { KeyboardEvent } from 'react';
import { Pin, PinOff, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/components/ui/context-menu';
import type { RecentFolders } from '../hooks/useRecentFolders';
import type { RecentFolder } from '../types/workspace';
import { RowAction } from './RowAction';

/** Why a folder cannot be opened, named as literals so the orphan check sees them in use. */
const REASONS = {
  notAllowed: 'workspace.recent.notAllowed',
  missing: 'workspace.recent.missing',
} as const;

export interface RecentFolderRowProps {
  readonly folder: RecentFolder;

  /** A change to this row is on its way: its actions wait. */
  readonly busy: boolean;

  /** Why the last change to this row was refused. */
  readonly failure: ReturnType<RecentFolders['failureOf']>;

  /** Opens it. Absent — in Settings — the row only manages the folder. */
  onOpen?(path: string): void;
  onPin(path: string, pinned: boolean): void;
  onForget(path: string): void;
}

/**
 * One recent folder, and the three things that can be done to it.
 *
 * Pin, unpin and remove are reachable three ways — the buttons of the row, its context menu, and
 * the keyboard (`Delete` on the folder removes it; the context-menu key or `Shift+F10` opens the
 * menu) — because a row that only a mouse can manage is a row a keyboard cannot. A folder that can no
 * longer be opened keeps its row, **without** a link, and says why.
 */
export function RecentFolderRow({
  folder,
  busy,
  failure,
  onOpen,
  onPin,
  onForget,
}: RecentFolderRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const pinLabel = folder.pinned
    ? t('workspace.recent.unpin', { name: folder.name })
    : t('workspace.recent.pin', { name: folder.name });
  const forgetLabel = t('workspace.recent.remove', { name: folder.name });
  const pin = (): void => {
    onPin(folder.path, !folder.pinned);
  };
  const forget = (): void => {
    onForget(folder.path);
  };

  return (
    <li className="flex flex-col gap-1">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex items-center gap-2 rounded-lg border border-border p-2">
            <Summary
              folder={folder}
              {...(onOpen === undefined ? {} : { onOpen })}
              onForget={forget}
            />
            <RowAction
              icon={folder.pinned ? PinOff : Pin}
              label={pinLabel}
              busy={busy}
              onClick={pin}
            />
            <RowAction icon={X} label={forgetLabel} busy={busy} onClick={forget} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {folder.unavailable === null && onOpen !== undefined && (
            <ContextMenuItem
              onSelect={() => {
                onOpen(folder.path);
              }}
            >
              {t('workspace.recent.open')}
            </ContextMenuItem>
          )}
          <ContextMenuItem disabled={busy} onSelect={pin}>
            {pinLabel}
          </ContextMenuItem>
          <ContextMenuItem disabled={busy} onSelect={forget}>
            {forgetLabel}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {failure !== null && (
        <p role="alert" className="text-xs text-destructive">
          {t(failure.messageKey, failure.params)}
        </p>
      )}
    </li>
  );
}

interface SummaryProps {
  readonly folder: RecentFolder;
  onOpen?(path: string): void;
  onForget(): void;
}

/** The name, the path and when — a button that opens, or plain text with the reason it cannot. */
function Summary({ folder, onOpen, onForget }: SummaryProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const openedAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(folder.lastOpenedAt));

  const details = (
    <>
      <span className="flex items-center gap-2 text-sm font-medium">
        {folder.name}
        {folder.pinned && <Pin className="size-3 text-muted-foreground" aria-hidden />}
        {folder.pinned && <span className="sr-only">{t('workspace.recent.pinned')}</span>}
      </span>
      <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
        {folder.path}
      </span>
    </>
  );

  if (folder.unavailable !== null) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        {details}
        <span className="text-xs text-destructive">{t(REASONS[folder.unavailable])}</span>
      </div>
    );
  }

  const opened = (
    <span className="text-xs text-muted-foreground">
      {t('workspace.recent.openedAt', { at: openedAt })}
    </span>
  );

  if (onOpen === undefined) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        {details}
        {opened}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded text-left"
      aria-keyshortcuts="Delete"
      onClick={() => {
        onOpen(folder.path);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Delete') {
          event.preventDefault();
          onForget();
        }
      }}
    >
      {details}
      {opened}
    </button>
  );
}

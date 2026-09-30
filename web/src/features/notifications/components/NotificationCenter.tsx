import { Bell, BellOff, Check, CheckCheck, CloudOff, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { ListStatus } from '@/shared/components/ListStatus';
import { LoadMore } from '@/shared/components/LoadMore';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/shared/components/ui/sheet';
import { cn } from '@/shared/lib/utils';
import { useNotificationCenter } from '../hooks/useNotificationCenter';
import { useNotifications } from '../store/notifications.store';
import type { NotificationEntry, PendingNotification } from '../types/notification';
import { NotificationMessage } from './NotificationMessage';

/** What an entry of this window says about where it stands — named in full. */
const PENDING_STATES: Readonly<Record<PendingNotification['state'], string>> = {
  grouping: 'notifications.pending.saving',
  saving: 'notifications.pending.saving',
  unsaved: 'notifications.pending.unsaved',
  refused: 'notifications.pending.refused',
};

/**
 * The notification centre: the history the server keeps — the same after a reload and on another
 * device — and what this window raised that has not reached it yet (plan 06, S-131, S-182).
 *
 * Read, cleared one by one or all at once; "do not disturb" silences the toasts of this browser and
 * keeps the history. A change the server refuses is said here, in the centre, never as one more
 * notification.
 */
export function NotificationCenter(): React.JSX.Element {
  const { t } = useTranslation();
  const open = useNotifications((state) => state.centerOpen);
  const setOpen = useNotifications((state) => state.setCenterOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-3 sm:max-w-md"
        // The sheet takes the focus, not its first button: a focused button shows its tooltip, and
        // the first `Esc` would close the tooltip instead of the centre (plan 06, S-160).
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <SheetTitle>{t('notifications.center.title')}</SheetTitle>
        <SheetDescription className="text-ui text-muted-foreground">
          {t('notifications.center.description')}
        </SheetDescription>
        {open && <CenterBody />}
      </SheetContent>
    </Sheet>
  );
}

function CenterBody(): React.JSX.Element {
  const { t } = useTranslation();
  const center = useNotificationCenter();
  const doNotDisturb = useNotifications((state) => state.doNotDisturb);
  const setDoNotDisturb = useNotifications((state) => state.setDoNotDisturb);
  const empty = center.entries.length === 0 && center.pending.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1">
        <IconButton
          icon={doNotDisturb ? BellOff : Bell}
          label={t('notifications.center.doNotDisturb')}
          aria-pressed={doNotDisturb}
          onClick={() => {
            setDoNotDisturb(!doNotDisturb);
          }}
        />
        <IconButton
          icon={CheckCheck}
          label={t('notifications.center.markAllRead')}
          disabled={center.isBusy || center.entries.every((entry) => entry.readAt !== null)}
          onClick={center.markAllRead}
        />
        <IconButton
          icon={Trash2}
          label={t('notifications.center.clearAll')}
          disabled={center.isBusy || empty}
          onClick={center.clearAll}
        />
      </div>

      {doNotDisturb && (
        <p className="text-ui-sm text-muted-foreground">{t('notifications.center.silenced')}</p>
      )}
      {center.failure !== null && (
        <p role="alert" className="text-ui-sm text-destructive">
          {t(center.failure.messageKey, center.failure.params)}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {center.pending.length === 0 && (
          <ListStatus
            isLoading={center.isLoading}
            loadingLabel={t('notifications.center.loading')}
            error={center.error}
            onRetry={center.reload}
            isEmpty={empty}
            emptyTitle={t('notifications.center.emptyTitle')}
            emptyDescription={t('notifications.center.emptyDescription')}
            rows={3}
          />
        )}
        {!empty && (
          <ul aria-label={t('notifications.center.list')} className="flex flex-col gap-1">
            {center.pending.map((pending) => (
              <PendingRow
                key={pending.clientId}
                pending={pending}
                onDismiss={() => {
                  center.dismiss(pending.clientId);
                }}
              />
            ))}
            {center.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                busy={center.isBusy}
                onRead={() => {
                  center.markRead(entry.id);
                }}
                onRemove={() => {
                  center.remove(entry.id);
                }}
              />
            ))}
          </ul>
        )}
        <LoadMore
          hasMore={center.hasMore}
          isLoading={center.isLoadingMore}
          error={center.moreError}
          onLoadMore={center.loadMore}
          label={t('notifications.center.more')}
          loadingLabel={t('notifications.center.loadingMore')}
        />
      </div>
    </div>
  );
}

/** When it happened, in the language on screen. */
function useWhen(iso: string): string {
  const { i18n } = useTranslation();

  return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

interface EntryRowProps {
  readonly entry: NotificationEntry;
  readonly busy: boolean;
  onRead(): void;
  onRemove(): void;
}

function EntryRow({ entry, busy, onRead, onRemove }: EntryRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const when = useWhen(entry.createdAt);
  const unread = entry.readAt === null;

  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-md border border-border p-2',
        unread && 'border-l-2 border-l-primary',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <NotificationMessage
          severity={entry.severity}
          messageKey={entry.messageKey}
          params={entry.params}
          count={entry.count}
        />
        <p className="text-ui-sm text-muted-foreground">
          {unread ? t('notifications.entry.unreadAt', { when }) : when}
        </p>
      </div>
      {unread && (
        <IconButton
          icon={Check}
          label={t('notifications.entry.markRead')}
          disabled={busy}
          onClick={onRead}
        />
      )}
      <IconButton
        icon={X}
        label={t('notifications.entry.remove')}
        disabled={busy}
        onClick={onRemove}
      />
    </li>
  );
}

interface PendingRowProps {
  readonly pending: PendingNotification;
  onDismiss(): void;
}

/** One of this window's, not on the server yet — and saying so. */
function PendingRow({ pending, onDismiss }: PendingRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const when = useWhen(pending.createdAt);

  return (
    <li className="flex items-start gap-2 rounded-md border border-dashed border-border p-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <NotificationMessage
          severity={pending.severity}
          messageKey={pending.messageKey}
          params={pending.params}
          count={pending.count}
        />
        <p className="flex items-center gap-1 text-ui-sm text-muted-foreground">
          {pending.state === 'unsaved' && <CloudOff className="size-3.5" aria-hidden />}
          {t(PENDING_STATES[pending.state], { when })}
        </p>
      </div>
      <IconButton icon={X} label={t('notifications.entry.remove')} onClick={onDismiss} />
    </li>
  );
}

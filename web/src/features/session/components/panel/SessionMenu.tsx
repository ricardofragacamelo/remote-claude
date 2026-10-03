import { useState } from 'react';
import {
  Bell,
  BellOff,
  CircleHelp,
  Copy,
  Download,
  Ellipsis,
  History,
  ListChecks,
  Power,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { MenuTrigger } from '@/shared/components/MenuTrigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/shared/components/ui/dropdown-menu';
import { useCopy } from '@/shared/hooks/useCopy';
import { useBrowserNotifications } from '../../hooks/useBrowserNotifications';
import type { SessionHeaderState } from '../../hooks/useSessionHeader';
import { ActionDialog } from './ActionDialog';
import { ExportDialog } from './ExportDialog';
import { UndoDialog } from './UndoDialog';

export interface SessionMenuProps {
  /** The session on screen — `null` with a draft or a conversation of the history. */
  readonly session: SessionHeaderState | null;
  readonly folder: string;
  onOpenHelp(): void;
  onOpenRules?: (() => void) | undefined;
}

/** Which dialog of the menu is open. */
type Opened = 'close' | 'export' | 'undo' | null;

/** The look of the button of the menu — an icon of the header. */
const TRIGGER =
  'inline-flex size-touch shrink-0 items-center justify-center rounded-md hover:bg-accent ' +
  'data-[state=open]:bg-accent md:size-7';

/**
 * The menu of the session (`⋯`), in the header of the panel (plan 09, B-17): what is done to the
 * whole session, and seldom — end it (its owner's alone, and asked first: D-10), export it, undo
 * what it wrote, copy its id — and what is the panel's: the notifications of the browser, the rules
 * a "don't ask again" left, and the help. With no session on screen, only the panel's (S-41).
 */
export function SessionMenu({
  session,
  folder,
  onOpenHelp,
  onOpenRules,
}: SessionMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<Opened>(null);
  const copier = useCopy();
  const close = (): void => {
    setOpened(null);
  };

  return (
    <>
      {/* Not modal: an item opens a dialog, which takes the focus and the rest of the page itself. */}
      <DropdownMenu modal={false}>
        <MenuTrigger label={t('sessions.menu.open')}>
          <button type="button" className={TRIGGER} aria-label={t('sessions.menu.open')}>
            <Ellipsis className="size-4" aria-hidden />
          </button>
        </MenuTrigger>
        <DropdownMenuContent align="end" className="max-w-80">
          {session !== null && (
            <>
              <SessionItems session={session} onOpen={setOpened} onCopy={copier.copy} />
              <DropdownMenuSeparator />
            </>
          )}
          <NotificationsItem />
          {onOpenRules !== undefined && (
            <DropdownMenuItem onSelect={onOpenRules}>
              <ListChecks className="size-4" aria-hidden />
              {t('sessions.menu.rules')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onOpenHelp}>
            <CircleHelp className="size-4" aria-hidden />
            {t('claudePanel.help.open')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {copier.state !== 'idle' && session !== null && (
        <span role="status" className="sr-only">
          {copier.state === 'copied'
            ? t('sessions.menu.copied')
            : t('sessions.menu.copyFailed', { sessionId: session.sessionId })}
        </span>
      )}

      {session !== null && (
        <>
          {/* "End the session?" (D-10): what goes with it, and the way out first, where the focus
              starts. Confirming ends it once, however often it is pressed (S-39). */}
          <ActionDialog
            open={opened === 'close'}
            onClose={close}
            title={t('sessions.close.title')}
            description={t('sessions.close.description')}
            closeLabel={t('sessions.close.keep')}
            action={
              <Button
                variant="destructive"
                onClick={() => {
                  close();
                  session.close();
                }}
              >
                {t('sessions.close.confirm')}
              </Button>
            }
          />
          <ExportDialog
            open={opened === 'export'}
            onClose={close}
            conversationId={session.conversationId}
            folder={folder}
          />
          {opened === 'undo' && <UndoDialog sessionId={session.sessionId} open onClose={close} />}
        </>
      )}
    </>
  );
}

/** What the menu does to the session on screen. */
function SessionItems({
  session,
  onOpen,
  onCopy,
}: {
  readonly session: SessionHeaderState;
  onOpen(opened: Opened): void;
  onCopy(text: string): void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <DropdownMenuItem
        disabled={!session.isOwner || session.ended}
        onSelect={() => {
          onOpen('close');
        }}
        className="flex items-start gap-2 text-destructive"
      >
        <Power className="mt-0.5 size-4" aria-hidden />
        <span className="flex flex-col">
          <span>{t('session.controls.close')}</span>
          {!session.isOwner && (
            <span className="text-ui-xs text-muted-foreground">
              {t('session.controls.closeNotOwner')}
            </span>
          )}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={session.conversationId === null}
        onSelect={() => {
          onOpen('export');
        }}
      >
        <Download className="size-4" aria-hidden />
        {t('sessions.export.open')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          onOpen('undo');
        }}
      >
        <History className="size-4" aria-hidden />
        {t('sessions.menu.undo')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          onCopy(session.sessionId);
        }}
      >
        <Copy className="size-4" aria-hidden />
        {t('sessions.menu.copyId')}
      </DropdownMenuItem>
    </>
  );
}

/**
 * The notifications of the browser, turned on only by this click (08 · D-21) — and, refused by the
 * browser, how to give them back, inside the item and never a loose line of the header (plan 09,
 * S-42), while the badges go on telling (S-193).
 */
function NotificationsItem(): React.JSX.Element {
  const { t } = useTranslation();
  const notifications = useBrowserNotifications();
  const on = notifications.enabled && notifications.permission === 'granted';
  const off = notifications.permission === 'unsupported' || notifications.permission === 'denied';

  return (
    <DropdownMenuItem
      disabled={off}
      onSelect={on ? notifications.disable : notifications.enable}
      className="flex items-start gap-2"
    >
      {on ? (
        <Bell className="mt-0.5 size-4" aria-hidden />
      ) : (
        <BellOff className="mt-0.5 size-4" aria-hidden />
      )}
      <span className="flex flex-col">
        <span>{on ? t('sessions.browserNotice.turnOff') : t('sessions.browserNotice.turnOn')}</span>
        {off && (
          <span className="text-ui-xs text-muted-foreground">
            {whyOff(notifications.permission, t)}
          </span>
        )}
      </span>
    </DropdownMenuItem>
  );
}

function whyOff(permission: string, t: TFunction): string {
  return permission === 'denied'
    ? t('sessions.browserNotice.denied')
    : t('sessions.browserNotice.unsupported');
}

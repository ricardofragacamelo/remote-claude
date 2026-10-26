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
import { useAgentName } from '../../hooks/useEngines';
import type { SessionHeaderState } from '../../hooks/useSessionHeader';
import { ActionDialog } from './ActionDialog';
import { ExportDialog } from './ExportDialog';
import { UndoDialog } from './UndoDialog';

export interface SessionMenuProps {
  /** The session on screen — `null` with a draft or a conversation of the history. */
  readonly session: SessionHeaderState | null;
  onOpenHelp(): void;
  onOpenRules?: (() => void) | undefined;
}

/** Which dialog of the menu is open. */
type Opened = 'close' | 'export' | 'undo' | null;

/** Which id the menu copied last: the live session's, or the conversation's in its engine's store. */
type Copied = { readonly what: 'session' | 'conversation'; readonly id: string };

/** The look of the button of the menu — an icon of the header. */
const TRIGGER =
  'inline-flex size-touch shrink-0 items-center justify-center rounded-md hover:bg-accent ' +
  'data-[state=open]:bg-accent md:size-7';

/**
 * The menu of the session (`⋯`), in the header of the panel (plan 09, B-17): what is done to the
 * whole session, and seldom — end it (its owner's alone, and asked first: D-10), export it, undo
 * what it wrote, copy its id or the id of its conversation, named by its engine (plan 28, S-40) — and
 * what is the panel's: the notifications of the browser, the rules a "don't ask again" left, and the
 * help. With no session on screen, only the panel's (S-41).
 */
export function SessionMenu({
  session,
  onOpenHelp,
  onOpenRules,
}: SessionMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<Opened>(null);
  const [copied, setCopied] = useState<Copied | null>(null);
  const copier = useCopy();
  const agent = useAgentName(session?.conversation?.engine ?? null);
  const close = (): void => {
    setOpened(null);
  };
  const copy = (what: Copied['what'], id: string): void => {
    setCopied({ what, id });
    copier.copy(id);
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
              <SessionItems session={session} agent={agent} onOpen={setOpened} onCopy={copy} />
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
            {t('agentPanel.help.open')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {copier.state !== 'idle' && copied !== null && (
        <span role="status" className="sr-only">
          {copyStatus(t, copier.state === 'copied', copied, agent)}
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
            conversation={session.conversation}
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
  agent,
  onOpen,
  onCopy,
}: {
  readonly session: SessionHeaderState;

  /** How the engine of the session is named — the `{{agent}}` of the copy of its conversation's id. */
  readonly agent: string;
  onOpen(opened: Opened): void;
  onCopy(what: Copied['what'], id: string): void;
}): React.JSX.Element {
  const { conversation } = session;
  const { t } = useTranslation();

  return (
    <>
      <DropdownMenuItem
        disabled={session.ended}
        onSelect={() => {
          onOpen('close');
        }}
        className="flex items-start gap-2 text-destructive"
      >
        <Power className="mt-0.5 size-4" aria-hidden />
        <span>{t('session.controls.close')}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={conversation === null}
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
          onCopy('session', session.sessionId);
        }}
      >
        <Copy className="size-4" aria-hidden />
        {t('sessions.menu.copyId')}
      </DropdownMenuItem>
      {/* Until the stream names the conversation there is no id of it to copy. */}
      {conversation !== null && (
        <DropdownMenuItem
          onSelect={() => {
            onCopy('conversation', conversation.id);
          }}
        >
          <Copy className="size-4" aria-hidden />
          {t('sessions.menu.copyConversationId', { agent })}
        </DropdownMenuItem>
      )}
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

/** What the menu says once it tried to copy an id: that it did — which one —, or how to by hand. */
function copyStatus(t: TFunction, done: boolean, copied: Copied, agent: string): string {
  if (!done) {
    return t('sessions.menu.copyFailed', { id: copied.id });
  }

  return copied.what === 'session'
    ? t('sessions.menu.copied')
    : t('sessions.menu.conversationIdCopied', { agent });
}

function whyOff(permission: string, t: TFunction): string {
  return permission === 'denied'
    ? t('sessions.browserNotice.denied')
    : t('sessions.browserNotice.unsupported');
}

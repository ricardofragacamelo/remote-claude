import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useCommandMenu } from '../hooks/useCommandMenu';
import type { SlashCommand } from '../types/command';
import { Disclosure } from './Disclosure';
import { TitledList } from './TitledList';

export interface CommandMenuProps {
  readonly sessionId: string;

  /** Puts a command into the prompt box — its name, a slash in front and a space after. */
  onPick(text: string): void;
}

/**
 * The slash commands of **this installation**, searchable.
 *
 * Built from what the backend asked the live session, never from a list of ours: an installation
 * with fewer commands shows fewer (S-30), and one with none still has a prompt box that takes
 * anything typed. Picking a command writes it into the box and sends nothing — the person still
 * reads what is about to run, and adds its arguments.
 *
 * A menu that could not be read says so in one line, with a way to try again, and blocks nothing
 * (S-31): the menu is discovery, not a fence ([D-05](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 *
 * Closed until asked for, and asked for only when opened: a session screen is not the place to
 * spend a round trip to the SDK on a list nobody looked at.
 */
export function CommandMenu({ sessionId, onPick }: CommandMenuProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Disclosure label={t('commands.menu.toggle')} title={t('commands.menu.title')}>
      {(close) => (
        <CommandSearch
          sessionId={sessionId}
          onPick={(text) => {
            close();
            onPick(text);
          }}
        />
      )}
    </Disclosure>
  );
}

/** The open menu: the search box, the four states of the list, and the two groups. */
function CommandSearch({ sessionId, onPick }: CommandMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const searchId = useId();
  const menu = useCommandMenu(sessionId, search);
  const settled = !menu.isLoading && menu.error === null && !menu.isEmpty;
  const pick = (command: SlashCommand): void => {
    onPick(`${command.invocation} `);
  };

  return (
    <>
      <label className="text-xs uppercase opacity-70" htmlFor={searchId}>
        {t('commands.menu.search')}
      </label>
      <input
        id={searchId}
        type="search"
        className="rounded-lg border border-border bg-transparent p-2 text-sm"
        placeholder={t('commands.menu.searchPlaceholder')}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />

      {menu.isLoading && (
        <Skeleton className="h-16 w-full" aria-label={t('commands.menu.loading')} />
      )}

      {menu.error !== null && (
        <div role="alert" className="flex flex-col items-start gap-2 text-xs">
          <p className="text-destructive">{t(menu.error.messageKey, menu.error.params)}</p>
          <p>{t('commands.menu.unavailable')}</p>
          <Button type="button" variant="outline" onClick={menu.retry}>
            {t('common.action.retry')}
          </Button>
        </div>
      )}

      {menu.isEmpty && (
        <EmptyState
          title={t('commands.menu.emptyTitle')}
          description={t('commands.menu.emptyDescription')}
        />
      )}

      {settled && menu.suggested.length + menu.others.length === 0 && (
        <p className="text-sm" role="status">
          {t('commands.menu.noMatch', { search: search.trim() })}
        </p>
      )}

      <CommandGroup title={t('commands.menu.suggested')} commands={menu.suggested} onPick={pick} />
      <CommandGroup title={t('commands.menu.all')} commands={menu.others} onPick={pick} />

      {menu.cliVersion !== null && (
        <p className="text-xs opacity-70">
          {t('commands.menu.version', { version: menu.cliVersion })}
        </p>
      )}
    </>
  );
}

interface CommandGroupProps {
  readonly title: string;
  readonly commands: readonly SlashCommand[];
  onPick(command: SlashCommand): void;
}

/** One group of the menu, or nothing when the search left it empty. */
function CommandGroup({ title, commands, onPick }: CommandGroupProps): React.JSX.Element {
  return (
    <TitledList
      title={title}
      items={commands}
      keyOf={(command) => `${command.origin}:${command.name}`}
    >
      {(command) => (
        <Button
          type="button"
          variant="outline"
          className="h-auto w-full justify-start py-2"
          onClick={() => {
            onPick(command);
          }}
        >
          <span className="flex flex-col items-start gap-0.5 text-left">
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-sm">{command.invocation}</span>
              {command.argumentHint !== '' && (
                <span className="font-mono text-xs opacity-70">{command.argumentHint}</span>
              )}
            </span>
            {command.description !== '' && (
              <span className="text-xs opacity-70">{command.description}</span>
            )}
          </span>
        </Button>
      )}
    </TitledList>
  );
}

import { File, Folder, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/shared/components/ui/skeleton';
import type { MentionMenu, MentionOption, SlashMenu } from '../../hooks/useCompletionMenus';
import type { SlashCommand } from '../../types/command';

/** The id of an option in the DOM — what `aria-activedescendant` names. */
export const optionDomId = (listId: string, index: number): string => `${listId}-${String(index)}`;

interface ListProps<T> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly T[];
  readonly active: number;
  onPick(index: number): void;
  children(option: T): React.ReactNode;
}

/** A listbox the composer drives from its own box: the arrows move, Enter and Tab pick. */
function OptionList<T>({
  id,
  label,
  options,
  active,
  onPick,
  children,
}: ListProps<T>): React.JSX.Element {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={label}
      className="flex max-h-60 flex-col overflow-y-auto"
    >
      {options.map((option, index) => (
        <li
          key={optionDomId(id, index)}
          id={optionDomId(id, index)}
          role="option"
          aria-selected={index === active}
          className={
            'flex cursor-pointer items-baseline gap-2 rounded px-2 py-1 text-ui-sm ' +
            (index === active ? 'bg-accent text-accent-foreground' : '')
          }
          // Down, not click: a click lets the box lose the focus first, and the menu with it.
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(index);
          }}
        >
          {children(option)}
        </li>
      ))}
    </ul>
  );
}

/** A menu of the box: its loading, its failure, what it says of itself, and its options. */
function MenuFrame({
  loading,
  failure,
  notes,
  children,
}: {
  /** The name of the placeholder while it loads — or `null` once it is not loading. */
  readonly loading: string | null;
  readonly failure: string | null;

  /** What it says of itself — nothing matched, out of the folder, more than it shows. */
  readonly notes: readonly (string | null)[];
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-popover p-1">
      {loading !== null && <Skeleton className="h-6 w-full" aria-label={loading} />}
      {failure !== null && (
        <p role="alert" className="px-2 text-ui-xs text-muted-foreground">
          {failure}
        </p>
      )}
      {notes.map((note) =>
        note === null ? null : (
          <p key={note} role="status" className="px-2 text-ui-xs text-muted-foreground">
            {note}
          </p>
        ),
      )}
      {children}
    </div>
  );
}

/** The `@` menu: providers, the open files and the entries of the folder, and the typed path. */
export function MentionList({
  id,
  menu,
  active,
  onPick,
}: {
  readonly id: string;
  readonly menu: MentionMenu;
  readonly active: number;
  onPick(index: number): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const emptiness =
    menu.empty === 'emptyFolder'
      ? t('composer.mention.emptyFolder')
      : t('composer.mention.noMatch');

  return (
    <MenuFrame
      loading={menu.isLoading ? t('composer.mention.loading') : null}
      failure={menu.error === null ? null : t('composer.mention.failed')}
      notes={[
        menu.outside ? t('composer.mention.outside') : null,
        !menu.isLoading && !menu.outside && menu.empty !== null ? emptiness : null,
      ]}
    >
      <OptionList
        id={id}
        label={t('composer.mention.label')}
        options={menu.options}
        active={active}
        onPick={onPick}
      >
        {(option: MentionOption) => <MentionRow option={option} />}
      </OptionList>
      {menu.truncated && (
        <p role="status" className="px-2 text-ui-xs text-muted-foreground">
          {t('composer.mention.truncated')}
        </p>
      )}
    </MenuFrame>
  );
}

function MentionRow({ option }: { readonly option: MentionOption }): React.JSX.Element {
  const { t } = useTranslation();

  switch (option.kind) {
    case 'provider': {
      const mention = `@${option.provider.keyword}`;
      return (
        <>
          <Sparkles className="size-3.5 self-center" aria-hidden />
          <span className="font-mono">{mention}</span>
          <span className="text-ui-xs opacity-70">{t(option.provider.descriptionKey)}</span>
        </>
      );
    }
    case 'typed':
      return (
        <span className="text-ui-xs">{t('composer.mention.useTyped', { path: option.path })}</span>
      );
    default: {
      const Icon = option.entry.kind === 'folder' ? Folder : File;
      return (
        <>
          <Icon className="size-3.5 self-center" aria-hidden />
          <span className="truncate font-mono">{option.entry.path}</span>
          {option.open && (
            <span className="text-ui-xs opacity-70">{t('composer.mention.open')}</span>
          )}
        </>
      );
    }
  }
}

/** The origin of a command, as its badge says it (S-241). */
function originKey(command: SlashCommand): string {
  switch (command.origin) {
    case 'builtin':
      return 'composer.origin.builtin';
    case 'user':
      return 'composer.origin.user';
    case 'system':
      return 'composer.origin.system';
    default:
      return 'composer.origin.project';
  }
}

/** The `/` menu: the commands and skills of the installation, each with its origin. */
export function SlashList({
  id,
  menu,
  active,
  onPick,
}: {
  readonly id: string;
  readonly menu: SlashMenu;
  readonly active: number;
  onPick(index: number): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const nothing = !menu.isLoading && menu.error === null && menu.commands.length === 0;

  return (
    <MenuFrame
      loading={menu.isLoading ? t('composer.slash.loading') : null}
      failure={menu.error === null ? null : t('composer.slash.unavailable')}
      notes={[nothing ? t('composer.slash.noMatch') : null]}
    >
      <OptionList
        id={id}
        label={t('composer.slash.label')}
        options={menu.commands}
        active={active}
        onPick={onPick}
      >
        {(command: SlashCommand) => <SlashRow command={command} />}
      </OptionList>
    </MenuFrame>
  );
}

/** One command or skill of the `/` menu: its name, its badge, its hint and what it does. */
function SlashRow({ command }: { readonly command: SlashCommand }): React.JSX.Element {
  const { t } = useTranslation();
  const name = `/${command.label}`;

  return (
    <>
      <span className="font-mono">{name}</span>
      <span className="rounded border border-border px-1 text-ui-xs">{t(originKey(command))}</span>
      {command.shadowed && (
        <span className="text-ui-xs opacity-70">{t('composer.slash.shadowed')}</span>
      )}
      {command.argumentHint !== '' && (
        <span className="font-mono text-ui-xs opacity-70">{command.argumentHint}</span>
      )}
      {command.description !== '' && (
        <span className="truncate text-ui-xs opacity-70">{command.description}</span>
      )}
    </>
  );
}

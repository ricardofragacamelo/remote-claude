import { useRef } from 'react';
import { AtSign, Paperclip, Plus, TextSelect } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MenuTrigger } from '@/shared/components/MenuTrigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/shared/components/ui/dropdown-menu';
import { useRegistry } from '@/shared/hooks/useRegistry';
import type { ContextSet } from '../../hooks/useContextSet';
import { mentionProviders } from '../../lib/mention-providers';
import type { MentionProvider } from '../../lib/mention-providers';
import type { ContextItem } from '../../types/context';
import { BAR_BUTTON } from './bar';

export interface AddContextMenuProps {
  readonly folder: string;
  readonly context: ContextSet;

  /** Writes an `@` at the cursor of the box, which opens the list of the folder (plan 08, B-48). */
  onMention(): void;
}

/**
 * The `+` of the composer bar (plan 09, B-12): each way into the context of the next prompt that
 * plan 08 built, a click away — a file or a folder (the `@` list), a file of this computer (the
 * attachment of B-45, the same as dropping it) and what the editor has selected, or anything else
 * an `@` offers (B-51). Nothing new: each item leads to the flow that already exists (S-27).
 */
export function AddContextMenu({
  folder,
  context,
  onMention,
}: AddContextMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const picker = useRef<HTMLInputElement>(null);
  // Set by the item that hands the focus to the box: the menu then gives it there on closing.
  const toBox = useRef(false);

  return (
    <>
      <DropdownMenu>
        <MenuTrigger label={t('composer.add.open')}>
          <button type="button" className={BAR_BUTTON} aria-label={t('composer.add.open')}>
            <Plus className="size-4" aria-hidden />
          </button>
        </MenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          onCloseAutoFocus={(event) => {
            // The `@` is written once the menu has let go of the focus: written while it holds it,
            // the box would lose it back to the menu.
            if (toBox.current) {
              toBox.current = false;
              event.preventDefault();
              onMention();
            }
          }}
        >
          <DropdownMenuLabel>{t('composer.add.open')}</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => {
              toBox.current = true;
            }}
          >
            <AtSign className="size-4" aria-hidden />
            {t('composer.add.mention')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              picker.current?.click();
            }}
          >
            <Paperclip className="size-4" aria-hidden />
            {t('composer.add.computer')}
          </DropdownMenuItem>
          <ProviderItems folder={folder} context={context} />
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        aria-label={t('composer.add.computer')}
        onChange={(event) => {
          context.addFiles([...(event.currentTarget.files ?? [])]);
          // The same file picked twice is a second attachment, and only a cleared input says so.
          event.currentTarget.value = '';
        }}
      />
    </>
  );
}

/**
 * What an `@` offers besides the files — the selection of the editor, the terminal of plan 12 —,
 * read when the menu opens: one with nothing to give right now is there, off, and says why.
 */
function ProviderItems({
  folder,
  context,
}: {
  readonly folder: string;
  readonly context: ContextSet;
}): React.JSX.Element {
  const providers = useRegistry(mentionProviders);

  return (
    <>
      {providers.map((provider) => (
        <ProviderItem
          key={provider.id}
          provider={provider}
          items={provider.items(folder)}
          onAdd={context.add}
        />
      ))}
    </>
  );
}

/** One of them, with what it would add now — off, and saying so, when that is nothing. */
function ProviderItem({
  provider,
  items,
  onAdd,
}: {
  readonly provider: MentionProvider;
  readonly items: readonly ContextItem[] | null;
  onAdd(items: readonly ContextItem[]): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const given = items ?? [];

  return (
    <DropdownMenuItem
      disabled={given.length === 0}
      onSelect={() => {
        onAdd(given);
      }}
      className="flex items-start gap-2"
    >
      <TextSelect className="mt-0.5 size-4" aria-hidden />
      <span className="flex flex-col">
        <span>{t(provider.labelKey)}</span>
        <span className="text-ui-xs text-muted-foreground">
          {given.length === 0 ? t('composer.add.nothing') : t(provider.descriptionKey)}
        </span>
      </span>
    </DropdownMenuItem>
  );
}

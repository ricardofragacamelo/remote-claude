import { useMemo } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';

import { openAndRecentFiles } from '@/features/editor';
import { useFileFinder } from '@/features/search';
import type { FileFinder, LocateEntry } from '@/features/search';
import type { AppError } from '@/shared/api/errors';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { mentionTarget } from '../lib/composer-tokens';
import { mentionProviders, offeredProviders } from '../lib/mention-providers';
import type { MentionProvider } from '../lib/mention-providers';
import { fetchCommands, searchCommands } from '../services/command.service';
import type { MentionEntry } from '../services/composer.service';
import type { ContextItem } from '../types/context';
import type { CommandMenu, SlashCommand } from '../types/command';
import { useCatalog } from './useCatalog';

/** The keys of the commands of a live session, in one place. */
export const commandKeys = {
  all: ['sessions', 'commands'] as const,
  of: (sessionId: string) => [...commandKeys.all, sessionId] as const,
};

/** How many entries the `@` menu shows at most: a menu, not a listing. */
export const MAX_MENTIONS = 30;

/** One option of the `@` menu. */
export type MentionOption =
  | {
      readonly kind: 'entry';
      readonly id: string;
      readonly entry: MentionEntry;
      readonly open: boolean;
    }
  | {
      readonly kind: 'provider';
      readonly id: string;
      readonly provider: MentionProvider;
      readonly items: readonly ContextItem[];
    }
  | { readonly kind: 'typed'; readonly id: string; readonly path: string };

/** The `@` menu as it stands. */
export interface MentionMenu {
  readonly options: readonly MentionOption[];
  readonly isLoading: boolean;

  /** The search failed: the menu says so, and the typed path can still be chosen (S-232). */
  readonly error: AppError | null;

  /** More than a level holds: the person is told to refine (S-229). */
  readonly truncated: boolean;

  /** Why there is nothing to choose: nothing matched, or the folder is empty (S-229). */
  readonly empty: 'noMatch' | 'emptyFolder' | null;

  /** The query climbs out of the folder, which is never offered (S-230). */
  readonly outside: boolean;
}

/** `entries`, in this feature's own words — the open ones marked, for the badge of each row. */
function mentionOptionsOf(
  entries: readonly LocateEntry[],
  open: readonly string[],
): MentionOption[] {
  const isOpen = new Set(open);

  return entries.map((entry): MentionOption => {
    const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
    const mentionEntry: MentionEntry = {
      path: entry.path,
      name,
      kind: entry.kind === 'dir' ? 'folder' : 'file',
    };

    return {
      kind: 'entry',
      id: `entry:${entry.path}`,
      entry: mentionEntry,
      open: isOpen.has(entry.path),
    };
  });
}

/**
 * The `@` menu of the composer (plan 08, B-48; plan 11, B-25): any file or folder of the folder by
 * fuzzy match, anywhere in it — the files open in the editor and the recent ones first, and the
 * providers (`@selection`, and whatever another plan registers). The source is the locator of plan
 * 11 (`useFileFinder`, B-13), which cancels a query superseded by the next keystroke through its
 * own `AbortSignal` — an answer for a query no longer asked is never shown (S-173, the same promise
 * S-228 of plan 08 made over the tree's own levels, now kept by the finder instead).
 *
 * @param query what follows the `@`, or `null` when no `@` is being completed
 */
export function useMentionMenu(folder: string, query: string | null): MentionMenu {
  const target = mentionTarget(query ?? '');
  const providers = useRegistry(mentionProviders);
  const prefer = useMemo(() => openAndRecentFiles(folder), [folder]);
  const asked = query !== null && !target.outside;
  const finder = useFileFinder(
    asked ? folder : null,
    asked ? { query, kinds: ['file', 'dir'], prefer, limit: MAX_MENTIONS } : null,
  );

  return useMemo(
    () => mentionMenuOf({ query, outside: target.outside, folder, providers, finder, prefer }),
    [finder, folder, prefer, providers, query, target.outside],
  );
}

/** What the `@` menu is made of. */
interface MentionInputs {
  readonly query: string | null;
  readonly outside: boolean;
  readonly folder: string;
  readonly providers: readonly MentionProvider[];
  readonly finder: FileFinder;
  readonly prefer: readonly string[];
}

/** The `@` menu, from the locator's own entries, the providers and what was typed. */
function mentionMenuOf(inputs: MentionInputs): MentionMenu {
  const { query } = inputs;
  const closed = { isLoading: false, error: null, truncated: false, empty: null };

  if (query === null) {
    return { ...closed, options: [], outside: false };
  }

  if (inputs.outside) {
    // Out of the folder nothing is offered; typed by hand, it can still be chosen — and the
    // backend refuses it on the send, in the session's folder (S-230).
    return { ...closed, options: [typedOption(query)], outside: true };
  }

  const entries = mentionOptionsOf(inputs.finder.entries, inputs.prefer);
  const exact = entries.some((option) => option.kind === 'entry' && option.entry.path === query);

  return {
    options: [
      ...providerOptions(inputs.providers, inputs.folder, query),
      ...entries,
      ...(query === '' || exact ? [] : [typedOption(query)]),
    ],
    isLoading: inputs.finder.isLoading,
    error: inputs.finder.error,
    truncated: inputs.finder.truncated !== null,
    empty: entries.length === 0 ? (query === '' ? 'emptyFolder' : 'noMatch') : null,
    outside: false,
  };
}

function typedOption(path: string): MentionOption {
  return { kind: 'typed', id: `typed:${path}`, path };
}

/** The providers offered for a query — none once the query names a folder. */
function providerOptions(
  providers: readonly MentionProvider[],
  folder: string,
  query: string,
): MentionOption[] {
  return query.includes('/')
    ? []
    : offeredProviders(providers, folder, query).map((each) => ({
        kind: 'provider',
        id: `provider:${each.provider.id}`,
        provider: each.provider,
        items: each.items,
      }));
}

/** The `/` menu as it stands. */
export interface SlashMenu {
  readonly commands: readonly SlashCommand[];
  readonly isLoading: boolean;

  /** The list could not be read: the composer goes on, and `/name` goes as text (S-246). */
  readonly error: AppError | null;
}

/**
 * The `/` menu of the composer (plan 08, B-50): the commands and skills of the installation, with
 * their origin — of the live session, or, in a draft, of the catalogue of the folder (D-13). It
 * filters as the person types, by name, label, alias and description; the list is one query, so an
 * answer that arrives late never replaces what the filter shows now (S-247).
 *
 * @param search what follows the `/`, or `null` when no `/` is being completed
 */
export function useSlashMenu(
  folder: string,
  sessionId: string | null,
  search: string | null,
): SlashMenu {
  const catalog = useCatalog(folder, sessionId === null && search !== null);
  const live = useQuery<CommandMenu, AppError>({
    queryKey: commandKeys.of(sessionId ?? ''),
    queryFn: sessionId === null ? skipToken : () => fetchCommands(sessionId),
    enabled: search !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const all = sessionId === null ? catalog.data?.commands : live.data?.commands;

  return useMemo(() => {
    const groups = searchCommands(all ?? [], search ?? '');

    return {
      commands: [...groups.suggested, ...groups.others],
      isLoading: sessionId === null ? catalog.isLoading : live.isLoading,
      error: sessionId === null ? catalog.error : live.error,
    };
  }, [all, catalog.error, catalog.isLoading, live.error, live.isLoading, search, sessionId]);
}

import { useMemo } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';

import { openAndRecentFiles } from '@/features/editor';
import type { AppError } from '@/shared/api/errors';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { mentionTarget } from '../lib/composer-tokens';
import { mentionProviders, offeredProviders } from '../lib/mention-providers';
import type { MentionProvider } from '../lib/mention-providers';
import { fetchCommands, searchCommands } from '../services/command.service';
import { listMentionLevel } from '../services/composer.service';
import type { MentionEntry, MentionLevel } from '../services/composer.service';
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

/** Whether `wanted` can be read in `name`, its letters in order — the loose match of a menu. */
function matches(name: string, wanted: string): boolean {
  let at = 0;
  const lower = name.toLowerCase();

  for (const letter of wanted.toLowerCase()) {
    at = lower.indexOf(letter, at);
    if (at === -1) {
      return false;
    }
    at += 1;
  }

  return true;
}

/** Smaller first: a name that starts with what was typed, then one that contains it, then the rest. */
function rank(name: string, wanted: string): number {
  const lower = name.toLowerCase();
  const typed = wanted.toLowerCase();

  if (lower.startsWith(typed)) {
    return 0;
  }

  return lower.includes(typed) ? 1 : 2;
}

/** The options of a level of the folder, the open and recent files first (D-12, provisional). */
function mentionOptions(
  level: MentionLevel | undefined,
  directory: string,
  partial: string,
  open: readonly string[],
): MentionOption[] {
  const inDirectory = (path: string) =>
    directory === '' ? !path.includes('/') : path.startsWith(`${directory}/`);
  const prefix = directory === '' ? '' : `${directory}/`;
  const openHere = open
    .filter((path) => matches(path, `${prefix}${partial}`))
    .slice(0, MAX_MENTIONS);
  const opened = openHere.map((path): MentionOption => ({
    kind: 'entry',
    id: `open:${path}`,
    entry: { path, name: path.slice(path.lastIndexOf('/') + 1), kind: 'file' },
    open: true,
  }));
  const shown = new Set(openHere);
  const listed = (level?.entries ?? [])
    .filter((entry) => inDirectory(entry.path) && !shown.has(entry.path))
    .filter((entry) => matches(entry.name, partial))
    .sort((left, right) => rank(left.name, partial) - rank(right.name, partial))
    .map((entry): MentionOption => ({
      kind: 'entry',
      id: `entry:${entry.path}`,
      entry,
      open: false,
    }));

  return [...opened, ...listed].slice(0, MAX_MENTIONS);
}

/**
 * The `@` menu of the composer (plan 08, B-48): the entries of the folder by the level the query is
 * in — `@src/co` lists `src` and finds `co` there —, the files open in the editor and the recent ones
 * first, and the providers (`@selection`, and whatever another plan registers).
 *
 * The source is the tree of plan 07 (`GET /files/tree`), the provisional step D-12 allows until the
 * finder of plan 11 exists — registered in the progress of the plan; the swap is B-25 of plan 11. An
 * answer for a level that is no longer the one asked is never shown: each level is its own query,
 * and the menu reads the one the query names now (S-228).
 *
 * @param query what follows the `@`, or `null` when no `@` is being completed
 */
export function useMentionMenu(folder: string, query: string | null): MentionMenu {
  const target = mentionTarget(query ?? '');
  const providers = useRegistry(mentionProviders);
  const listing = useQuery<MentionLevel, AppError>({
    queryKey: ['sessions', 'mention', folder, target.directory],
    queryFn: () => listMentionLevel(folder, target.directory),
    enabled: query !== null && !target.outside,
    staleTime: 10_000,
    retry: false,
  });

  const { directory, partial, outside } = target;

  return useMemo(
    () =>
      mentionMenuOf({
        query,
        directory,
        partial,
        outside,
        folder,
        providers,
        listing: listing.data,
        isLoading: listing.isLoading,
        error: listing.error,
      }),
    [
      directory,
      folder,
      listing.data,
      listing.error,
      listing.isLoading,
      outside,
      partial,
      providers,
      query,
    ],
  );
}

/** What the `@` menu is made of. */
interface MentionInputs {
  readonly query: string | null;
  readonly directory: string;
  readonly partial: string;
  readonly outside: boolean;
  readonly folder: string;
  readonly providers: readonly MentionProvider[];
  readonly listing: MentionLevel | undefined;
  readonly isLoading: boolean;
  readonly error: AppError | null;
}

/** The `@` menu, from the level listed, the providers and what was typed. */
function mentionMenuOf(inputs: MentionInputs): MentionMenu {
  const { query, listing } = inputs;
  const closed = { isLoading: false, error: null, truncated: false, empty: null };

  if (query === null) {
    return { ...closed, options: [], outside: false };
  }

  if (inputs.outside) {
    // Out of the folder nothing is offered; typed by hand, it can still be chosen — and the
    // backend refuses it on the send, in the session's folder (S-230).
    return { ...closed, options: [typedOption(query)], outside: true };
  }

  const entries = mentionOptions(
    listing,
    inputs.directory,
    inputs.partial,
    openAndRecentFiles(inputs.folder),
  );
  const exact = entries.some((option) => option.kind === 'entry' && option.entry.path === query);

  return {
    options: [
      ...providerOptions(inputs.providers, inputs.folder, query),
      ...entries,
      ...(query === '' || exact ? [] : [typedOption(query)]),
    ],
    isLoading: inputs.isLoading,
    error: inputs.error,
    truncated: listing?.truncated === true,
    empty: emptinessOf(entries.length, listing, inputs.directory),
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

function emptinessOf(
  found: number,
  listing: MentionLevel | undefined,
  directory: string,
): MentionMenu['empty'] {
  if (found > 0) {
    return null;
  }

  return listing !== undefined && listing.entries.length === 0 && directory === ''
    ? 'emptyFolder'
    : 'noMatch';
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

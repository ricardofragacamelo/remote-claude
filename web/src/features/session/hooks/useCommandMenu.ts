import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchCommands, searchCommands } from '../services/command.service';
import type { CommandGroups, CommandMenu } from '../types/command';

/** The keys of the menu, in one place. */
export const commandKeys = {
  all: ['sessions', 'commands'] as const,
  of: (sessionId: string) => [...commandKeys.all, sessionId] as const,
};

/** How long a menu stays good: the thirty seconds every stable server datum here gets. */
const STALE_AFTER_MS = 30_000;

/** What the menu gets: the two groups a search leaves, and the four states of the list. */
export interface CommandMenuState extends CommandGroups {
  readonly isLoading: boolean;

  /** Why the menu could not be read. The prompt box does not care: the menu is discovery. */
  readonly error: AppError | null;

  /** The installation offers nothing at all — not "the search found nothing". */
  readonly isEmpty: boolean;

  /** The version of the CLI the list came from, once known. */
  readonly cliVersion: string | null;

  retry(): void;
}

/**
 * The slash commands of the live session, searched.
 *
 * Asked for by the open menu only, and kept for thirty seconds: the list changes with the
 * installation, not with the conversation. A failure is **not** a failure of the screen — the
 * prompt box accepts anything typed, so the menu being down costs a shortcut and nothing else (S-31).
 *
 * @param search what the person typed in the search box
 */
export function useCommandMenu(sessionId: string, search: string): CommandMenuState {
  const query = useQuery<CommandMenu, AppError>({
    queryKey: commandKeys.of(sessionId),
    queryFn: () => fetchCommands(sessionId),
    staleTime: STALE_AFTER_MS,
    refetchOnWindowFocus: false,
  });

  const commands = query.data?.commands;
  const groups = useMemo(() => searchCommands(commands ?? [], search), [commands, search]);

  return {
    ...groups,
    isLoading: query.isLoading,
    error: query.error,
    isEmpty: commands !== undefined && commands.length === 0,
    cliVersion: query.data?.cliVersion ?? null,
    retry: () => {
      void query.refetch();
    },
  };
}

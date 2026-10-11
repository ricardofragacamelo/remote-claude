import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { AppError } from '@/shared/api/errors';
import { agentNameIn, nameAgents } from '@/shared/i18n';
import { capabilitiesIn } from '../lib/capabilities';
import { fetchEngines } from '../services/engine.service';
import type { EngineCapabilities, EngineDirectory } from '../types/engine';

/** Where the engines are kept in the cache — they change only when the installation does. */
export const engineKeys = { all: ['engines'] as const };

/** The engines of the installation, as a screen reads them. */
export interface Engines {
  readonly directory: EngineDirectory | null;
  readonly isLoading: boolean;
  readonly error: AppError | null;

  /**
   * How a screen names `engine`: its `displayName`, its id when it is not listed, the default
   * engine's name for `null` — and, before anything is known, a word that names no agent.
   */
  nameOf(engine: string | null): string;
}

/**
 * The coding agents this installation drives (`GET /engines`, plan 28, B-13): server data, so it
 * lives in the query cache, and read once a session — it changes only with the installation.
 *
 * Read and kept, and nothing is hidden by it yet: the phase of each control does that (plan 28).
 */
export function useEngines(): Engines {
  const { t } = useTranslation();
  const query = useQuery<EngineDirectory, AppError>({
    queryKey: engineKeys.all,
    queryFn: fetchEngines,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const directory = query.data ?? null;

  return {
    directory,
    isLoading: query.isLoading,
    error: query.error,
    nameOf: (engine) => agentNameIn(directory, engine) ?? t('engine.name.fallback'),
  };
}

/**
 * The engines as the page already read them — the shell reads them once, to name the agents
 * ({@link useAgentNamesKept}) — without asking again: what a screen with no live session decides a
 * control by, such as the task list of a conversation read from the history (plan 28, S-68).
 * `null` until they are read.
 */
export function useKnownEngines(): EngineDirectory | null {
  const query = useQuery<EngineDirectory, AppError>({
    queryKey: engineKeys.all,
    queryFn: fetchEngines,
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return query.data ?? null;
}

/**
 * What `engine` can do — the default engine for `null` — as `GET /engines` lists it, asked once if
 * nobody asked yet: what a screen with no session decides a choice by, such as the modes and the
 * levels of effort a draft offers, or the ones a default can take (plan 28, B-27, B-28). `null`
 * until the list is read.
 */
export function useEngineCapabilities(engine: string | null): EngineCapabilities | null {
  return capabilitiesIn(useEngines().directory, engine);
}

/** How a screen names `engine` — the `{{agent}}` of the texts that say which agent it is. */
export function useAgentName(engine: string | null): string {
  return useEngines().nameOf(engine);
}

/**
 * Keeps the names of the engines where every translation finds them, so the `{{agent}}` of an
 * error — which carries only `params.engine` — reads as the agent's name on every screen (S-26).
 */
export function useAgentNamesKept(): void {
  const { directory } = useEngines();

  useEffect(() => {
    nameAgents(directory);
  }, [directory]);
}

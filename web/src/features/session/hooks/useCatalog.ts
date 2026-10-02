import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchCatalog } from '../services/composer.service';
import type { InstallationCatalog } from '../services/composer.service';
import { rememberModels } from '../store/known-models.store';
import { loadedOf } from './loaded';
import type { Loaded } from './loaded';

/** The keys of the catalogue, in one place. */
export const catalogKeys = {
  of: (folder: string) => ['sessions', 'catalog', folder] as const,
};

/** How long a catalogue stays good: the thirty seconds every stable answer of the server gets. */
const STALE_AFTER_MS = 30_000;

/**
 * What a folder's installation offers before a session exists — its commands and skills, its
 * models and the ceilings of the composer (plan 08, B-50, D-13).
 *
 * One query per folder, shared by every conversation of the tab (S-245), and its models are what a
 * draft of the folder offers in its model picker. With `ask` off, it reads what is already known and
 * asks nothing. A failure blocks nothing: the menu is discovery,
 * and the composer takes whatever is typed (S-246).
 */
export function useCatalog(folder: string, ask = true): Loaded<InstallationCatalog> {
  const query = useQuery<InstallationCatalog, AppError>({
    queryKey: catalogKeys.of(folder),
    queryFn: () => fetchCatalog(folder),
    staleTime: STALE_AFTER_MS,
    refetchOnWindowFocus: false,
    retry: false,
    // Asked only by what needs the installation — the `/` of a draft: opening a draft must not
    // open a query of the CLI, which takes a slot of the machine while it lives (D-13).
    enabled: ask && folder !== '',
  });
  const models = query.data?.models;

  useEffect(() => {
    if (models !== undefined && models.length > 0) {
      rememberModels(folder, models);
    }
  }, [folder, models]);

  return loadedOf(query);
}

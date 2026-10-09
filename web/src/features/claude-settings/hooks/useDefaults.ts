import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import {
  clearFolderDefaults,
  fetchDefaults,
  fetchModels,
  saveFolderDefaults,
  saveUserDefaults,
} from '../services/claude-config.service';
import type { ClaudeDefaults, ClaudeModel, DefaultsView } from '../types/defaults';
import { claudeConfigKeys } from './claude-config-keys';

/** Where a save goes: the user's own default, or the folder's override. */
export type DefaultsScope = 'user' | 'folder';

/** The defaults in view, the models they are chosen among, and the ways to change them. */
export interface Defaults {
  readonly view: DefaultsView | null;
  readonly models: readonly ClaudeModel[];
  readonly isLoading: boolean;
  readonly error: AppError | null;

  /** The list of models could not be read — the selector offers only the installation's default. */
  readonly modelsError: AppError | null;

  /** No model to choose from: the list failed, or the installation listed none (S-36). */
  readonly noModels: boolean;
  retry(): void;

  save(scope: DefaultsScope, values: ClaudeDefaults): void;
  clearFolder(): void;
  readonly saving: boolean;
  readonly saveError: AppError | null;
  readonly saved: boolean;
}

/**
 * The defaults of the user and of a folder (plan 13, B-14, B-16). A save is not optimistic: the
 * server says — it checks the model against the installation **now** — and then the view is read
 * again, with where each field comes from.
 */
export function useDefaults(folder: string | undefined): Defaults {
  const queryClient = useQueryClient();
  const defaults = useQuery<DefaultsView, AppError>({
    queryKey: claudeConfigKeys.defaults(folder),
    queryFn: () => fetchDefaults(folder),
    retry: false,
  });
  const models = useQuery<readonly ClaudeModel[], AppError>({
    queryKey: claudeConfigKeys.models(folder),
    queryFn: () => fetchModels(folder),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const settle = (view: DefaultsView | void): Promise<void> => {
    if (view !== undefined) {
      queryClient.setQueryData(claudeConfigKeys.defaults(folder), view);
    }
    return queryClient.invalidateQueries({ queryKey: [...claudeConfigKeys.all, 'defaults'] });
  };

  const save = useMutation<
    DefaultsView,
    AppError,
    { scope: DefaultsScope; values: ClaudeDefaults }
  >({
    mutationFn: ({ scope, values }) =>
      scope === 'folder' && folder !== undefined
        ? saveFolderDefaults(folder, values)
        : saveUserDefaults(values),
    onSuccess: settle,
  });
  const clear = useMutation<void, AppError, void>({
    mutationFn: () => (folder === undefined ? Promise.resolve() : clearFolderDefaults(folder)),
    onSuccess: () => settle(),
  });

  return {
    view: defaults.data ?? null,
    models: models.data ?? [],
    isLoading: defaults.isPending,
    error: defaults.error,
    modelsError: models.error,
    noModels: models.error !== null || (models.isSuccess && models.data.length === 0),
    retry: () => {
      void defaults.refetch();
      void models.refetch();
    },
    save: (scope, values) => {
      save.mutate({ scope, values });
    },
    clearFolder: () => {
      clear.mutate();
    },
    saving: save.isPending || clear.isPending,
    saveError: save.error ?? clear.error,
    saved: save.isSuccess,
  };
}

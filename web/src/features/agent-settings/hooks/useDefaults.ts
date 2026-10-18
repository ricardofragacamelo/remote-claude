import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import {
  clearFolderDefaults,
  fetchDefaults,
  fetchModels,
  saveFolderDefaults,
  saveUserDefaults,
} from '../services/agent-settings.service';
import type { AgentDefaults, AgentModel, DefaultsView } from '../types/defaults';
import { agentSettingsKeys } from './agent-settings-keys';

/** Where a save goes: the user's own default, or the folder's override. */
export type DefaultsScope = 'user' | 'folder';

/** The defaults in view, the models they are chosen among, and the ways to change them. */
export interface Defaults {
  readonly view: DefaultsView | null;
  readonly models: readonly AgentModel[];
  readonly isLoading: boolean;
  readonly error: AppError | null;

  /** The list of models could not be read — the selector offers only the installation's default. */
  readonly modelsError: AppError | null;

  /** No model to choose from: the list failed, or the installation listed none (S-36). */
  readonly noModels: boolean;
  retry(): void;

  save(scope: DefaultsScope, values: AgentDefaults): void;
  clearFolder(): void;
  readonly saving: boolean;
  readonly saveError: AppError | null;
  readonly saved: boolean;
}

/**
 * The defaults of the user and of a folder, for one engine (plan 13, B-14, B-16; plan 28, B-36). A
 * save is not optimistic: the server says — it checks the model against the installation **now** —
 * and then the view is read again, with where each field comes from.
 */
export function useDefaults(engine: string, folder: string | undefined): Defaults {
  const queryClient = useQueryClient();
  const defaults = useQuery<DefaultsView, AppError>({
    queryKey: agentSettingsKeys.defaults(engine, folder),
    queryFn: () => fetchDefaults(engine, folder),
    retry: false,
  });
  const models = useQuery<readonly AgentModel[], AppError>({
    queryKey: agentSettingsKeys.models(engine, folder),
    queryFn: () => fetchModels(engine, folder),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const settle = (view: DefaultsView | void): Promise<void> => {
    if (view !== undefined) {
      queryClient.setQueryData(agentSettingsKeys.defaults(engine, folder), view);
    }
    return queryClient.invalidateQueries({
      queryKey: [...agentSettingsKeys.all(engine), 'defaults'],
    });
  };

  const save = useMutation<DefaultsView, AppError, { scope: DefaultsScope; values: AgentDefaults }>(
    {
      mutationFn: ({ scope, values }) =>
        scope === 'folder' && folder !== undefined
          ? saveFolderDefaults(engine, folder, values)
          : saveUserDefaults(engine, values),
      onSuccess: settle,
    },
  );
  const clear = useMutation<void, AppError, void>({
    mutationFn: () =>
      folder === undefined ? Promise.resolve() : clearFolderDefaults(engine, folder),
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

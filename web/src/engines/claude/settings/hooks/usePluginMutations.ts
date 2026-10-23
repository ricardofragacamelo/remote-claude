import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { settledBatch } from '@/shared/lib/settled-batch';
import type { BatchItemResult, BatchTarget } from '@/shared/lib/settled-batch';
import { pluginErrorOf } from '../lib/plugin-errors';
import {
  addLocalPlugin,
  applyPluginUpdate,
  installMarketplacePlugin,
  removePlugin,
  setPluginEnabled,
} from '../services/plugin.service';
import type { PluginView } from '../types/plugin';
import { pluginKeys } from './plugin-keys';

export type {
  BatchItemResult as PluginBatchItemResult,
  BatchTarget as PluginBatchTarget,
} from '@/shared/lib/settled-batch';

/** Every write this screen makes against the store of plugins (plan 13, B-29). */
export interface PluginMutations {
  addLocal(path: string): Promise<PluginView>;
  installFromMarketplace(marketplace: string, plugin: string): Promise<PluginView>;

  /** Turns one or many plugins on or off — a partial failure never stops the others (S-134's same contract). */
  setEnabled(
    targets: readonly BatchTarget[],
    enabled: boolean,
  ): Promise<readonly BatchItemResult[]>;

  /** Removes one or many — same partial-failure contract as {@link setEnabled}. */
  removeMany(targets: readonly BatchTarget[]): Promise<readonly BatchItemResult[]>;

  applyUpdate(id: string): Promise<PluginView>;

  readonly saving: boolean;
  readonly saveError: AppError | null;
}

/**
 * Every write this screen makes (plan 13, B-29): a settled save, never optimistic — the list is read
 * again once the backend confirms. Bulk actions run one request per plugin and report each outcome
 * on its own, so a plugin refused never stops the rest (mirrors `useMcpServerMutations`' own
 * `setEnabled`/`removeMany`, S-134, and shares the same `settledBatch` they are both built on).
 */
export function usePluginMutations(): PluginMutations {
  const queryClient = useQueryClient();
  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: pluginKeys.list() });

  const addLocal = useMutation<PluginView, AppError, string>({
    mutationFn: (path) => addLocalPlugin(path),
    onSuccess: invalidate,
  });
  const installFromMarketplace = useMutation<
    PluginView,
    AppError,
    { marketplace: string; plugin: string }
  >({
    mutationFn: ({ marketplace, plugin }) => installMarketplacePlugin(marketplace, plugin),
    onSuccess: invalidate,
  });
  const toggle = useMutation<PluginView, AppError, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) => setPluginEnabled(id, enabled),
    onSuccess: invalidate,
  });
  const remove = useMutation<void, AppError, string>({
    mutationFn: (id) => removePlugin(id),
    onSuccess: invalidate,
  });
  const update = useMutation<PluginView, AppError, string>({
    mutationFn: (id) => applyPluginUpdate(id),
    onSuccess: invalidate,
  });

  return {
    addLocal: (path) => addLocal.mutateAsync(path),
    installFromMarketplace: (marketplace, plugin) =>
      installFromMarketplace.mutateAsync({ marketplace, plugin }),
    setEnabled: async (targets, enabled) => {
      const results = await settledBatch(
        targets,
        (target) => toggle.mutateAsync({ id: target.id, enabled }),
        pluginErrorOf,
      );
      await invalidate();
      return results;
    },
    removeMany: async (targets) => {
      const results = await settledBatch(
        targets,
        (target) => remove.mutateAsync(target.id),
        pluginErrorOf,
      );
      await invalidate();
      return results;
    },
    applyUpdate: (id) => update.mutateAsync(id),
    saving:
      addLocal.isPending ||
      installFromMarketplace.isPending ||
      toggle.isPending ||
      remove.isPending ||
      update.isPending,
    saveError:
      addLocal.error ??
      installFromMarketplace.error ??
      toggle.error ??
      remove.error ??
      update.error,
  };
}

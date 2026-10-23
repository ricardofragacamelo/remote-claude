import { useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { pluginErrorOf } from '../lib/plugin-errors';
import type { PluginMutations } from './usePluginMutations';
import type { MarketplaceCatalogEntry } from '../types/plugin';

/** What is on screen between choosing a catalogue entry and confirming its install (S-212). */
export interface InstallMarketplaceState {
  readonly marketplace: string;
  readonly entry: MarketplaceCatalogEntry;
  readonly installing: boolean;
  readonly error: AppError | null;
}

export interface InstallMarketplaceFlow {
  readonly state: InstallMarketplaceState | null;

  /** Opens the confirm — chosen from the catalogue already on screen, never typed (S-212). */
  ask(marketplace: string, entry: MarketplaceCatalogEntry): void;
  confirm(): Promise<void>;
  cancel(): void;
}

/**
 * The confirm of installing a plugin from a declared marketplace (plan 13, B-47, B-29, S-212).
 *
 * Unlike the local-add flow, there is no separate network preview here (D-90): a marketplace
 * catalogue entry only ever carries `{ name, description, supported }` — the full manifest a plugin
 * brings is known only once it is actually fetched, which is exactly what confirming does. The
 * catalogue browse itself (choosing from a list already read, never typing a name) is this flow's
 * own "first step"; the dialog this hook drives is its second and only confirm, same `nothing
 * written until confirmed` discipline as every other write of this screen.
 */
export function useInstallMarketplaceFlow(mutations: PluginMutations): InstallMarketplaceFlow {
  const [state, setState] = useState<InstallMarketplaceState | null>(null);

  return {
    state,
    ask: (marketplace, entry) => {
      setState({ marketplace, entry, installing: false, error: null });
    },
    confirm: async () => {
      if (state === null) {
        return;
      }

      setState({ ...state, installing: true, error: null });
      try {
        await mutations.installFromMarketplace(state.marketplace, state.entry.name);
        setState(null);
      } catch (error) {
        setState((current) =>
          current === null
            ? current
            : { ...current, installing: false, error: pluginErrorOf(error) },
        );
      }
    },
    cancel: () => {
      setState(null);
    },
  };
}

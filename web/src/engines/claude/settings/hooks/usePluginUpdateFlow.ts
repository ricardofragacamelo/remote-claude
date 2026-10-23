import { useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { pluginErrorOf } from '../lib/plugin-errors';
import { fetchPluginUpdate } from '../services/plugin.service';
import type { PluginMutations } from './usePluginMutations';
import type { PluginUpdateCheck, PluginView } from '../types/plugin';

/** What is on screen while checking, or after checking, a plugin's update (S-205). */
export interface PluginUpdateState {
  readonly plugin: PluginView;
  readonly checking: boolean;
  readonly check: PluginUpdateCheck | null;
  readonly applying: boolean;
  readonly error: AppError | null;
}

export interface PluginUpdateFlow {
  readonly state: PluginUpdateState | null;

  /** Checks [plugin] for an update — `GET .../update`, which never changes anything (S-205). */
  check(plugin: PluginView): Promise<void>;

  /** Applies the update already shown — the second step that actually swaps the commit (S-205). */
  apply(): Promise<void>;
  cancel(): void;
}

/**
 * "Atualização disponível", checked on demand (plan 13, B-47, B-29, S-205) — never fetched for every
 * row on mount: checking an update clones the marketplace's repository on the backend (D-70), and
 * doing that for every marketplace plugin just because the list rendered would be exactly the kind
 * of speculative request the plan's own decisions (D-69, D-89) already avoid elsewhere. A click
 * checks one plugin; the dialog this hook drives then shows either "up to date" or the diff, and
 * only `apply` writes anything.
 */
export function usePluginUpdateFlow(mutations: PluginMutations): PluginUpdateFlow {
  const [state, setState] = useState<PluginUpdateState | null>(null);

  return {
    state,
    check: async (plugin) => {
      setState({ plugin, checking: true, check: null, applying: false, error: null });
      try {
        const check = await fetchPluginUpdate(plugin.id);
        setState((current) =>
          current === null ? current : { ...current, checking: false, check },
        );
      } catch (error) {
        setState((current) =>
          current === null ? current : { ...current, checking: false, error: pluginErrorOf(error) },
        );
      }
    },
    apply: async () => {
      if (state === null) {
        return;
      }

      setState({ ...state, applying: true, error: null });

      try {
        await mutations.applyUpdate(state.plugin.id);
        setState(null);
      } catch (thrown) {
        const failure = pluginErrorOf(thrown);
        setState((current) =>
          current === null ? current : { ...current, applying: false, error: failure },
        );
      }
    },
    cancel: () => {
      setState(null);
    },
  };
}

import { useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { pluginErrorOf } from '../lib/plugin-errors';
import { previewLocalPlugin } from '../services/plugin.service';
import type { PluginMutations } from './usePluginMutations';
import type { PluginPreview } from '../types/plugin';

/** Where the add-local-plugin wizard is, and with what (S-125, S-137). */
export interface AddLocalPluginState {
  readonly step: 'form' | 'preview';
  readonly path: string;
  readonly pathIssue: string | null;
  readonly preview: PluginPreview | null;
  readonly saving: boolean;
  readonly saveError: AppError | null;
  readonly previewing: boolean;
  readonly previewError: AppError | null;
}

export interface AddLocalPluginFlow {
  readonly state: AddLocalPluginState | null;
  start(): void;
  setPath(path: string): void;

  /** Validates locally; clean, it asks the server for what the manifest at [path] declares (S-125). */
  toPreview(): Promise<void>;

  /** Back to the form, keeping the draft — nothing was written by reaching the preview. */
  back(): void;

  /** The confirm of the second step — only now is anything written. */
  confirm(): Promise<void>;
  cancel(): void;
}

/**
 * The two-step flow of adding a local plugin (plan 13, B-29, S-125, S-137): a path, chosen through
 * the folder-browse dialog (never typed loose — the plan's own text), then a preview of exactly what
 * the manifest at that path declares, word for word (`POST .../plugins/preview`). Nothing is written
 * until {@link AddLocalPluginFlow.confirm} is called from the second step — the same discipline
 * `useAddServerFlow` already has for an MCP server.
 */
export function useAddLocalPluginFlow(mutations: PluginMutations): AddLocalPluginFlow {
  const [state, setState] = useState<AddLocalPluginState | null>(null);

  /** Merges [fields] into the live draft — a no-op once the wizard has already closed. */
  const patch = (fields: Partial<AddLocalPluginState>): void => {
    setState((current) => (current === null ? current : { ...current, ...fields }));
  };

  return {
    state,
    start: () => {
      setState({
        step: 'form',
        path: '',
        pathIssue: null,
        preview: null,
        previewing: false,
        previewError: null,
        saving: false,
        saveError: null,
      });
    },
    setPath: (path) => {
      patch({ path, pathIssue: null });
    },
    toPreview: async () => {
      if (state === null) {
        return;
      }
      if (state.path.trim() === '') {
        patch({ pathIssue: 'engines.claude.plugins.issuePathRequired' });
        return;
      }

      patch({ pathIssue: null, previewing: true, previewError: null });

      try {
        const preview = await previewLocalPlugin(state.path);
        patch({ step: 'preview', preview, previewing: false });
      } catch (thrown) {
        patch({ previewing: false, previewError: pluginErrorOf(thrown) });
      }
    },
    back: () => {
      patch({ step: 'form', preview: null });
    },
    confirm: async () => {
      if (state === null) {
        return;
      }

      patch({ saving: true, saveError: null });

      try {
        await mutations.addLocal(state.path);
        setState(null);
      } catch (thrown) {
        patch({ saving: false, saveError: pluginErrorOf(thrown) });
      }
    },
    cancel: () => {
      setState(null);
    },
  };
}

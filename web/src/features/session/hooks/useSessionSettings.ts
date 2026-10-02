import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { fetchModels } from '../services/insight.service';
import { setSessionModel, setSessionPermissionMode } from '../services/live-session.service';
import { liveSessionStoreOf } from '../store/live-session.store';
import type { InstallationModel, SessionModels } from '../types/insight';
import { rememberModels } from '../store/known-models.store';

/** The model and the mode of a live session, and the models it could switch to (plan 08, B-36). */
export interface SessionSettings {
  readonly model: string | null;
  readonly mode: string | null;

  /** The installation's models — empty while unknown or when the list could not be had (S-168). */
  readonly models: readonly InstallationModel[];
  readonly modelsError: AppError | null;
  setModel(model: string): void;
  setMode(mode: string): void;
}

/**
 * What the selectors of the panel read and change. The list of models is the installation's own —
 * `supportedModels()`, never a constant of ours (S-166) — and a list that cannot be had leaves the
 * selector with the model in use, the prompt box going on (S-168).
 */
export function useSessionSettings(folder: string, sessionId: string): SessionSettings {
  const live = liveSessionStoreOf(sessionId);
  const model = useStore(live, (state) => state.model);
  const mode = useStore(live, (state) => state.permissionMode);

  const query = useQuery<SessionModels, AppError>({
    queryKey: ['sessions', 'models', sessionId],
    queryFn: () => fetchModels(sessionId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (query.data !== undefined) {
      rememberModels(folder, query.data.models);
    }
  }, [folder, query.data]);

  return {
    model: model ?? query.data?.current ?? null,
    mode,
    models: query.data?.models ?? [],
    modelsError: query.error,
    setModel: useCallback(
      (next: string) => {
        if (setSessionModel(wsClient, sessionId, next)) {
          live.getState().noteModel(next);
        }
      },
      [live, sessionId],
    ),
    setMode: useCallback(
      (next: string) => {
        if (setSessionPermissionMode(wsClient, sessionId, next)) {
          live.getState().noteMode(next);
        }
      },
      [live, sessionId],
    ),
  };
}

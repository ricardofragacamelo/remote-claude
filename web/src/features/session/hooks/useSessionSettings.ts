import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { fetchModels } from '../services/insight.service';
import { setSessionModel, setSessionPermissionMode } from '../services/live-session.service';
import { claudePanelStore } from '../store/claude-panel.store';
import type { EffortLevel } from '../store/claude-panel.store';
import { liveSessionStoreOf } from '../store/live-session.store';
import type { InstallationModel, SessionModels } from '../types/insight';
import { rememberModels } from '../store/known-models.store';
import { useCommandRefusal } from './useCommandRefusal';

/** The model and the mode of a live session, and the models it could switch to (plan 08, B-36). */
export interface SessionSettings {
  readonly model: string | null;
  readonly mode: string | null;

  /** The effort it started with — `undefined` when it was not opened here, and is not known. */
  readonly effort: EffortLevel | null | undefined;

  /** The installation's models — empty while unknown or when the list could not be had (S-168). */
  readonly models: readonly InstallationModel[];
  readonly modelsError: AppError | null;

  /** Why the last change of the model or the mode was refused — the chip went back (S-23). */
  readonly refusal: AppError | null;
  setModel(model: string): void;
  setMode(mode: string): void;
}

/**
 * What the choices of the composer bar read and change. The list of models is the installation's
 * own — `supportedModels()`, never a constant of ours (S-166) — and a list that cannot be had leaves
 * the chip with the model in use, the prompt box going on (S-168).
 *
 * A change shows at once — the server acknowledges, it does not echo — and a refusal puts the chip
 * back to what it was, with the reason translated (plan 09, S-23).
 *
 * @param running whether the session still runs — one that ended is asked nothing
 */
export function useSessionSettings(
  folder: string,
  sessionId: string,
  running = true,
): SessionSettings {
  const live = liveSessionStoreOf(sessionId);
  const model = useStore(live, (state) => state.model);
  const mode = useStore(live, (state) => state.permissionMode);
  const effort = useStore(claudePanelStore(folder), (state) => state.efforts[sessionId]);
  const refused = useCommandRefusal();
  const { expect } = refused;
  const putBack = useRef<(() => void) | null>(null);

  const query = useQuery<SessionModels, AppError>({
    queryKey: ['sessions', 'models', sessionId],
    queryFn: () => fetchModels(sessionId),
    staleTime: 5 * 60_000,
    retry: false,
    // An ended session has no models to switch to.
    enabled: running,
  });

  useEffect(() => {
    if (query.data !== undefined) {
      rememberModels(folder, query.data.models);
    }
  }, [folder, query.data]);

  useEffect(() => {
    if (refused.error !== null) {
      putBack.current?.();
      putBack.current = null;
    }
  }, [refused.error]);

  const change = useCallback(
    (commandId: string | null, show: () => void, undo: () => void) => {
      if (commandId !== null) {
        putBack.current = undo;
        expect(commandId);
        show();
      }
    },
    [expect],
  );

  return {
    model: model ?? query.data?.current ?? null,
    mode,
    effort,
    models: query.data?.models ?? [],
    modelsError: query.error,
    refusal: refused.error,
    setModel: useCallback(
      (next: string) => {
        const before = live.getState().model;
        change(
          setSessionModel(wsClient, sessionId, next),
          () => {
            live.getState().noteModel(next);
          },
          () => {
            live.getState().noteModel(before);
          },
        );
      },
      [change, live, sessionId],
    ),
    setMode: useCallback(
      (next: string) => {
        const before = live.getState().permissionMode;
        change(
          setSessionPermissionMode(wsClient, sessionId, next),
          () => {
            live.getState().noteMode(next);
          },
          () => {
            live.getState().noteMode(before);
          },
        );
      },
      [change, live, sessionId],
    ),
  };
}

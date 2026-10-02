import { useCallback, useEffect, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { useTheme } from '@/shared/hooks/useTheme';
import { loadEngine } from '../lib/engine-loader';
import type { EngineKind } from '../lib/engine-loader';
import type { CodeEditorEngine } from '../types/code-editor';
import { asAppError } from './documents';

/** The editor of this width, once loaded — or why it did not load, and the way to try again. */
export interface EngineState {
  readonly engine: CodeEditorEngine | null;
  readonly error: AppError | null;
  retry(): void;
}

/**
 * The editor for the width of the window: Monaco from `md` up, loaded the first time a file needs
 * it (S-204); the simplified mode below `md`, which loads nothing (S-206). A load that fails says so,
 * translated, with "try again" (S-205); the rest of the tab carries on.
 *
 * The editor follows the theme, the moment it changes (S-207).
 */
export function useCodeEditorEngine(): EngineState {
  const kind: EngineKind = useIsDesktop() ? 'monaco' : 'plain';
  const theme = useTheme((state) => state.theme);
  const [loaded, setLoaded] = useState<{ kind: EngineKind; engine: CodeEditorEngine } | null>(null);
  const [failed, setFailed] = useState<{ kind: EngineKind; error: AppError } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;

    loadEngine(kind).then(
      (engine) => {
        if (live) {
          setFailed(null);
          setLoaded({ kind, engine });
        }
      },
      (error: unknown) => {
        if (live) {
          setFailed({ kind, error: asAppError(error) });
        }
      },
    );

    return () => {
      live = false;
    };
  }, [kind, attempt]);

  const engine = loaded?.kind === kind ? loaded.engine : null;

  useEffect(() => {
    engine?.setTheme(theme);
  }, [engine, theme]);

  const retry = useCallback(() => {
    setFailed(null);
    setAttempt((count) => count + 1);
  }, []);

  return { engine, error: failed?.kind === kind ? failed.error : null, retry };
}

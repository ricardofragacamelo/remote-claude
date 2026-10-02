import { AppError } from '@/shared/api/errors';
import { newTraceId } from '@/shared/lib/trace';
import { logger } from '@/shared/logging/logger';
import type { CodeEditorEngine } from '../types/code-editor';
import { createPlainEngine } from './plain-engine';

/** The two adapters of the port: Monaco from `md` up, the simplified mode below it (07 · D-09). */
export type EngineKind = CodeEditorEngine['kind'];

/** How an adapter is reached. */
export type EngineLoader = () => Promise<CodeEditorEngine>;

/**
 * Monaco is a chunk of its own, loaded by the first file opened from `md` up — never part of the
 * first page (S-204). The simplified mode is a text area, and costs nothing to load.
 */
const DEFAULT_LOADERS: Readonly<Record<EngineKind, EngineLoader>> = {
  monaco: () => import('./monaco-engine').then((module) => module.createMonacoEngine()),
  plain: () => Promise.resolve(createPlainEngine()),
};

const loaders: Record<EngineKind, EngineLoader> = { ...DEFAULT_LOADERS };
const loading = new Map<EngineKind, Promise<CodeEditorEngine>>();

/**
 * The adapter of a kind — loaded once per page, however many tabs ask (the import deduplicates).
 *
 * A load that fails is forgotten, so "try again" really tries again (S-205).
 *
 * @throws {AppError} `NETWORK_UNREACHABLE` — the chunk did not arrive — with the editor's own message
 */
export function loadEngine(kind: EngineKind): Promise<CodeEditorEngine> {
  const existing = loading.get(kind);

  if (existing !== undefined) {
    return existing;
  }

  logger.debug({ op: 'editor.load', engine: kind }, 'editor loading');
  const started = loaders[kind]().then(
    (engine) => {
      logger.debug({ op: 'editor.load', engine: kind, outcome: 'loaded' }, 'editor loaded');
      return engine;
    },
    (error: unknown) => {
      loading.delete(kind);
      logger.warn(
        { op: 'editor.load', engine: kind, outcome: 'failed', err: String(error) },
        'editor failed to load',
      );
      throw new AppError('NETWORK_UNREACHABLE', 'editor.load.failed', newTraceId());
    },
  );

  loading.set(kind, started);
  return started;
}

/**
 * Stands another adapter in for one kind — what jsdom tests do for Monaco, which needs a real
 * browser — or, with no loader, puts the default back. Whatever was loaded is forgotten.
 */
export function setEngineLoader(kind: EngineKind, loader?: EngineLoader): void {
  loaders[kind] = loader ?? DEFAULT_LOADERS[kind];
  loading.delete(kind);
}

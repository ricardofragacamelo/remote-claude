import { logger } from '@/shared/logging/logger';

/** An engine in a chunk of its own — pdf.js, Mermaid — reached by a dynamic import. */
export interface LazyEngine<T> {
  /**
   * The engine — loaded once per page, however many ask. A load that fails is forgotten, so "try
   * again" really tries again.
   *
   * @throws what `failed` makes of the failure
   */
  load(): Promise<T>;

  /**
   * Stands another loader in — what jsdom tests do, where the engine cannot run — or, with none,
   * puts the default back. Whatever was loaded is forgotten.
   */
  replace(next?: () => Promise<T>): void;
}

/**
 * The one way the app loads an engine on demand (plan 07, B-50; plan 21, B-16): loaded by the first
 * that asks, logged at `debug`, its failure at `warn` and forgotten.
 *
 * @param op the `op` of its log lines
 * @param initial the dynamic import of the engine
 * @param failed what a failure becomes for the caller
 */
export function lazyEngine<T>(
  op: string,
  initial: () => Promise<T>,
  failed: (error: unknown) => unknown = (error) => error,
): LazyEngine<T> {
  let loader = initial;
  let loading: Promise<T> | null = null;

  return {
    load: () => {
      if (loading !== null) {
        return loading;
      }

      logger.debug({ op }, 'engine loading');
      const started = loader().then(
        (engine) => {
          logger.debug({ op, outcome: 'loaded' }, 'engine loaded');
          return engine;
        },
        (error: unknown) => {
          loading = null;
          logger.warn({ op, outcome: 'failed', err: String(error) }, 'engine failed to load');
          throw failed(error);
        },
      );

      loading = started;
      return started;
    },
    replace: (next) => {
      loader = next ?? initial;
      loading = null;
    },
  };
}

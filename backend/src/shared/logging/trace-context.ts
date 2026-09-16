import { AsyncLocalStorage } from 'node:async_hooks';

/** What travels with an in-flight operation without being passed as a parameter. */
export interface TraceContext {
  readonly traceId: string;
}

const storage = new AsyncLocalStorage<TraceContext>();

/**
 * Runs `body` with `context` in scope.
 *
 * The domain never receives a `traceId` argument: observability is not a domain concept, and a
 * rule that takes one as a parameter has learnt something it has no business knowing.
 * See docs/architecture/shared/03-logging.md.
 */
export function runWithTrace<T>(context: TraceContext, body: () => T): T {
  return storage.run(context, body);
}

/** The trace of the operation in flight, or `null` outside one. */
export function currentTraceId(): string | null {
  return storage.getStore()?.traceId ?? null;
}

import { DomainError } from '@domain/shared';

/**
 * Something was asked of an engine that it does not have — a model switch, the context in use, a
 * fork.
 *
 * `409`: the request is well formed, and the state of the session (the engine it runs on) is what
 * refuses it. Never a `500`, and never an `undefined` that leaks out of a missing method (ADR-025).
 */
export class EngineCapabilityUnavailableError extends DomainError {
  readonly code = 'ENGINE_CAPABILITY_UNAVAILABLE';
  readonly messageKey = 'engine.error.capabilityUnavailable';

  constructor(engine: string, capability: string) {
    super(`the engine ${engine} has no ${capability}`, { engine, capability });
  }
}

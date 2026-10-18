/**
 * What a push names when it names an agent at all — the installation's default engine, asked
 * without spending a subprocess (`describe()` never does, ADR-025).
 *
 * `notification` has no engine of its own to ask: every request it tells a phone about belongs to
 * whichever session raised it, and by the time the push goes out that session may already be
 * closed. The default is what every other neutral surface falls back to until a request carries
 * its own engine (plan 28, D-31).
 */
export interface DefaultEngineName {
  /** The engine's own name, a proper noun — interpolated into a push's words, never translated. */
  read(): Promise<string>;
}

export const DEFAULT_ENGINE_NAME = Symbol('DefaultEngineName');

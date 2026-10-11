import type { EngineCapabilities } from './engine-capabilities.value-object';
import type { EngineId } from './engine-id.value-object';

/**
 * Whether an engine can open a session now: `available`; `unavailable` with a reason (its CLI is
 * missing, it is not logged in, its security assertion failed). Another engine is never affected.
 */
export type EngineState = 'available' | 'unavailable';

/**
 * What an engine says of itself, without spending quota (ADR-025): installed, which version,
 * logged in, and what it can do. The credential itself is never part of it.
 */
export interface EngineDescription {
  readonly engine: EngineId;
  /** The engine's own name, a proper noun — never translated, never written in the core's strings. */
  readonly displayName: string;
  readonly state: EngineState;
  /** Why it is unavailable, as a key the client translates — `null` when available. */
  readonly reason: string | null;
  /** The version of the binary the adapter drives, or `null` when it could not tell. */
  readonly version: string | null;
  /** Whether it is logged in — `null` when the engine cannot tell without spending a subprocess. */
  readonly authenticated: boolean | null;
  readonly capabilities: EngineCapabilities;
}

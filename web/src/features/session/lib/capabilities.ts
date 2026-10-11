import type { EngineCapabilities, EngineDirectory } from '../types/engine';

/** The capabilities an engine either has or has not — what a control exists by (plan 28). */
export type CapabilityFlag = {
  [K in keyof EngineCapabilities]: EngineCapabilities[K] extends boolean ? K : never;
}[keyof EngineCapabilities];

/**
 * Whether an engine can do `flag` — and so whether the control of it exists at all (plan 28, F3).
 *
 * Only an engine that **said** it cannot is refused: before the capabilities are known — a stream
 * that has not brought its `session.started` yet, a server older than them — the control stays, and
 * the server is the one that refuses, with `ENGINE_CAPABILITY_UNAVAILABLE`, which the screen says.
 */
export function canDo(capabilities: EngineCapabilities | null, flag: CapabilityFlag): boolean {
  return capabilities?.[flag] !== false;
}

/** What the control draws when the engine can do `flag` — `null`, and it draws nothing, if not. */
export function ifCan<T>(
  capabilities: EngineCapabilities | null,
  flag: CapabilityFlag,
  value: T,
): T | null {
  return canDo(capabilities, flag) ? value : null;
}

/**
 * The capabilities `GET /engines` lists for `engine` — the default engine's for `null` — or `null`
 * when the directory is not known yet, or does not list it.
 */
export function capabilitiesIn(
  directory: EngineDirectory | null,
  engine: string | null,
): EngineCapabilities | null {
  const id = engine ?? directory?.defaultEngine ?? null;
  return directory?.engines.find((each) => each.id === id)?.capabilities ?? null;
}

/** One engine as a screen names it: the id the contract carries, and the name a person reads. */
export interface NamedAgent {
  readonly id: string;
  readonly displayName: string;
}

/** The engines this installation drives, as `GET /engines` lists them — what an `{{agent}}` reads. */
export interface AgentDirectory {
  readonly defaultEngine: string | null;
  readonly engines: readonly NamedAgent[];
}

/**
 * The name of an engine, in the order a person is best served by: its `displayName`, then its id —
 * a name nobody translated beats a blank —, and, when the text names no engine at all, the default
 * engine's `displayName`. `null` when not even that is known.
 */
export function agentNameIn(directory: AgentDirectory | null, engine: unknown): string | null {
  const named = (id: unknown): string | null =>
    directory?.engines.find((each) => each.id === id)?.displayName ?? null;

  if (typeof engine === 'string' && engine.length > 0) {
    return named(engine) ?? engine;
  }

  return named(directory?.defaultEngine);
}

/** The directory the translations read, kept by whoever reads `GET /engines` (plan 28, B-13). */
let known: AgentDirectory | null = null;

/** Keeps the engines a translation names: what fills the `{{agent}}` of every text that has one. */
export function nameAgents(directory: AgentDirectory | null): void {
  known = directory;
}

/** The name of `engine` by the directory kept — see {@link agentNameIn}. */
export function agentNameOf(engine: unknown): string | null {
  return agentNameIn(known, engine);
}
